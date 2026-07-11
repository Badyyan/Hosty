import type { Project, TeamRole } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./auth";

/**
 * Single authorization enforcement point for project access.
 * Personal projects: owner only. Team projects: role hierarchy.
 */

const ROLE_RANK: Record<TeamRole, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  OWNER: 3,
};

export async function assertProjectAccess(
  userId: string,
  projectId: string,
  minRole: TeamRole = "EDITOR"
): Promise<Project> {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "Project not found");

  if (project.userId === userId) return project;

  if (project.teamId) {
    const membership = await db.teamMember.findUnique({
      where: { teamId_userId: { teamId: project.teamId, userId } },
    });
    if (membership && ROLE_RANK[membership.role] >= ROLE_RANK[minRole]) {
      return project;
    }
  }
  // 404 (not 403) so project IDs can't be enumerated
  throw new ApiError(404, "Project not found");
}

export async function assertTeamRole(
  userId: string,
  teamId: string,
  minRole: TeamRole
): Promise<TeamRole> {
  const membership = await db.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
  if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new ApiError(404, "Team not found");
  }
  return membership.role;
}
