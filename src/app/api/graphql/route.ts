import { createSchema, createYoga } from "graphql-yoga";
import { authenticateApiKey, type ApiKeyContext } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { getUserPlan } from "@/lib/plans";
import { deleteProject } from "@/lib/deployments";
import { siteUrl } from "@/lib/config";
import { ApiError } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GraphQL API (read-heavy companion to REST v1). Same auth: API keys via
 * `Authorization: Bearer hty_…`. Deploys stay on REST (multipart uploads
 * don't belong in GraphQL); everything else is queryable in one round trip.
 *
 *   curl -X POST https://hosty.site/api/graphql \
 *     -H "Authorization: Bearer $HOSTY_API_KEY" -H "Content-Type: application/json" \
 *     -d '{"query":"{ me { email plan } projects { name url analytics(days:7){ visitors } } }"}'
 */

const typeDefs = /* GraphQL */ `
  type Query {
    me: Me!
    projects(search: String, limit: Int = 25): [Project!]!
    project(id: ID!): Project
  }

  type Mutation {
    deleteProject(id: ID!): Boolean!
    setProjectName(id: ID!, name: String!): Project!
  }

  type Me {
    email: String!
    name: String
    plan: String!
    projectCount: Int!
    storageBytes: Float!
    maxStorageBytes: Float!
  }

  type Project {
    id: ID!
    name: String!
    slug: String!
    type: String!
    url: String!
    version: Int!
    createdAt: String!
    updatedAt: String!
    files: [File!]!
    analytics(days: Int = 30): Analytics!
    leads: [Lead!]!
  }

  type File {
    path: String!
    size: Int!
    contentType: String!
  }

  type Analytics {
    visitors: Int!
    sessions: Int!
    pageViews: Int!
    downloads: Int!
    bounceRate: Float!
    topPages: [Stat!]!
    referrers: [Stat!]!
    countries: [Stat!]!
  }

  type Stat {
    key: String!
    count: Int!
  }

  type Lead {
    email: String!
    name: String
    createdAt: String!
  }
`;

interface GqlContext {
  auth: ApiKeyContext;
}

type ProjectRow = NonNullable<Awaited<ReturnType<typeof db.project.findFirst>>>;

async function ownedProject(ctx: GqlContext, id: string): Promise<ProjectRow> {
  const project = await db.project.findFirst({
    where: { id, userId: ctx.auth.userId },
  });
  if (!project) throw new Error("Project not found");
  return project;
}

const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: GqlContext) => {
      const [user, plan, projectCount] = await Promise.all([
        db.user.findUniqueOrThrow({ where: { id: ctx.auth.userId } }),
        getUserPlan(ctx.auth.userId),
        db.project.count({ where: { userId: ctx.auth.userId } }),
      ]);
      return {
        email: user.email,
        name: user.name,
        plan: plan.tier,
        projectCount,
        storageBytes: Number(user.storageUsed),
        maxStorageBytes: plan.maxStorageBytes,
      };
    },
    projects: (_: unknown, args: { search?: string; limit?: number }, ctx: GqlContext) =>
      db.project.findMany({
        where: {
          userId: ctx.auth.userId,
          ...(args.search
            ? { name: { contains: args.search, mode: "insensitive" as const } }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: Math.min(100, Math.max(1, args.limit ?? 25)),
      }),
    project: (_: unknown, args: { id: string }, ctx: GqlContext) =>
      ownedProject(ctx, args.id).catch(() => null),
  },

  Mutation: {
    deleteProject: async (_: unknown, args: { id: string }, ctx: GqlContext) => {
      requireScope(ctx, "write");
      const project = await ownedProject(ctx, args.id);
      await deleteProject(project.id, ctx.auth.userId);
      return true;
    },
    setProjectName: async (_: unknown, args: { id: string; name: string }, ctx: GqlContext) => {
      requireScope(ctx, "write");
      const project = await ownedProject(ctx, args.id);
      const name = args.name.trim().slice(0, 120);
      if (!name) throw new Error("Name required");
      return db.project.update({ where: { id: project.id }, data: { name } });
    },
  },

  Project: {
    url: (p: ProjectRow) => siteUrl(p.slug),
    createdAt: (p: ProjectRow) => p.createdAt.toISOString(),
    updatedAt: (p: ProjectRow) => p.updatedAt.toISOString(),
    version: async (p: ProjectRow) => {
      if (!p.activeDeploymentId) return 0;
      const d = await db.deployment.findUnique({
        where: { id: p.activeDeploymentId },
        select: { version: true },
      });
      return d?.version ?? 0;
    },
    files: async (p: ProjectRow) =>
      p.activeDeploymentId
        ? db.projectFile.findMany({
            where: { deploymentId: p.activeDeploymentId },
            select: { path: true, size: true, contentType: true },
            orderBy: { path: "asc" },
          })
        : [],
    analytics: async (p: ProjectRow, args: { days?: number }) => {
      const days = Math.min(365, Math.max(1, args.days ?? 30));
      const to = new Date();
      return getAnalytics(p.id, new Date(to.getTime() - days * 86400_000), to);
    },
    leads: (p: ProjectRow) =>
      db.lead.findMany({
        where: { projectId: p.id },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
  },

  Lead: {
    createdAt: (l: { createdAt: Date }) => l.createdAt.toISOString(),
  },
};

function requireScope(ctx: GqlContext, scope: string) {
  if (!ctx.auth.scopes.includes(scope)) {
    throw new Error(`API key lacks the "${scope}" scope`);
  }
}

const yoga = createYoga<GqlContext>({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/api/graphql",
  landingPage: false,
  graphiql: false,
  fetchAPI: { Response },
  maskedErrors: false,
});

async function handler(req: Request) {
  let auth: ApiKeyContext;
  try {
    // "read" gates entry; mutations re-check "write" per-resolver.
    auth = await authenticateApiKey(req, "read");
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 401;
    return Response.json(
      { errors: [{ message: err instanceof Error ? err.message : "Unauthorized" }] },
      { status }
    );
  }
  return yoga.handleRequest(req, { auth });
}

export { handler as GET, handler as POST };
