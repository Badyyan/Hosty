import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * The feedback widget injected into hosted pages when feedback mode is on.
 * Self-contained vanilla JS: floating button → panel with comments, replies,
 * and "comment on selection" (highlight) support. Talks to /_hosty/comments.
 */
export async function GET() {
  return new NextResponse(WIDGET_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

const WIDGET_JS = `(function(){
var script=document.currentScript||document.querySelector('script[data-project]');
var PROJECT=script&&script.getAttribute('data-project');if(!PROJECT)return;
var PATH=location.pathname;
var css='#hsty-fb-btn{position:fixed;bottom:14px;left:14px;z-index:2147483001;background:#3563f9;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.3)}'+
'#hsty-fb-panel{position:fixed;top:0;right:0;bottom:0;width:340px;max-width:95vw;z-index:2147483002;background:#fff;color:#111;border-left:1px solid #e2e6ef;box-shadow:-8px 0 30px rgba(0,0,0,.15);display:none;flex-direction:column;font:14px/1.5 system-ui}'+
'#hsty-fb-panel.open{display:flex}'+
'.hsty-h{padding:14px 16px;border-bottom:1px solid #eef1f6;display:flex;justify-content:space-between;align-items:center;font-weight:700}'+
'.hsty-x{cursor:pointer;border:0;background:none;font-size:18px}'+
'.hsty-list{flex:1;overflow:auto;padding:12px 16px}'+
'.hsty-c{border:1px solid #eef1f6;border-radius:10px;padding:10px 12px;margin-bottom:10px}'+
'.hsty-c.res{opacity:.55}.hsty-a{font-weight:600;font-size:12px}.hsty-q{border-left:3px solid #3563f9;padding-left:8px;font-size:12px;color:#555;margin:6px 0;font-style:italic}'+
'.hsty-t{font-size:11px;color:#999}.hsty-r{margin-top:8px;margin-left:10px;border-left:2px solid #eef1f6;padding-left:8px}'+
'.hsty-f{padding:12px 16px;border-top:1px solid #eef1f6}'+
'.hsty-f input,.hsty-f textarea{width:100%;box-sizing:border-box;border:1px solid #dbe1ec;border-radius:8px;padding:8px 10px;font:13px system-ui;margin-bottom:8px}'+
'.hsty-f button{width:100%;background:#3563f9;color:#fff;border:0;border-radius:8px;padding:9px;font:600 13px system-ui;cursor:pointer}'+
'.hsty-sel{background:#eef4ff;border:1px solid #bdd2ff;border-radius:8px;padding:6px 8px;font-size:12px;margin-bottom:8px;display:none}';
var style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
var btn=document.createElement('button');btn.id='hsty-fb-btn';btn.textContent='💬 Feedback';document.body.appendChild(btn);
var panel=document.createElement('div');panel.id='hsty-fb-panel';
panel.innerHTML='<div class="hsty-h"><span>Feedback</span><button class="hsty-x">✕</button></div>'+
'<div class="hsty-list"></div>'+
'<form class="hsty-f"><div class="hsty-sel"></div><input name="author" placeholder="Your name (optional)" maxlength="80">'+
'<textarea name="body" rows="3" placeholder="Leave a comment… (select page text first to attach a highlight)" required maxlength="4000"></textarea>'+
'<button type="submit">Post comment</button></form>';
document.body.appendChild(panel);
var quote='';
document.addEventListener('mouseup',function(){var s=String(window.getSelection());if(s.trim().length>3){quote=s.trim().slice(0,1000);
var box=panel.querySelector('.hsty-sel');box.style.display='block';box.textContent='Highlight: "'+quote.slice(0,120)+'"';}});
function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML}
function load(){fetch('/_hosty/comments?projectId='+encodeURIComponent(PROJECT)+'&path='+encodeURIComponent(PATH))
.then(function(r){return r.json()}).then(function(d){
var list=panel.querySelector('.hsty-list');
if(!d.comments.length){list.innerHTML='<p style="color:#889;font-size:13px">No comments yet — be the first!</p>';return}
list.innerHTML=d.comments.map(function(c){
return '<div class="hsty-c'+(c.resolved?' res':'')+'"><div class="hsty-a">'+esc(c.author)+(c.resolved?' · ✅ resolved':'')+'</div>'+
(c.quote?'<div class="hsty-q">'+esc(c.quote)+'</div>':'')+
'<div>'+esc(c.body)+'</div><div class="hsty-t">'+new Date(c.createdAt).toLocaleDateString()+'</div>'+
c.replies.map(function(r){return '<div class="hsty-r"><span class="hsty-a">'+esc(r.author)+'</span> '+esc(r.body)+'</div>'}).join('')+
'<div style="margin-top:6px"><a href="#" data-reply="'+c.id+'" style="font-size:12px;color:#3563f9">Reply</a></div></div>'}).join('');
list.querySelectorAll('[data-reply]').forEach(function(a){a.onclick=function(e){e.preventDefault();
var body=prompt('Reply:');if(!body)return;post({parentId:a.getAttribute('data-reply'),body:body,author:'Anonymous'})}})
})}
function post(data){fetch('/_hosty/comments',{method:'POST',headers:{'Content-Type':'application/json'},
body:JSON.stringify(Object.assign({projectId:PROJECT,path:PATH},data))}).then(load)}
btn.onclick=function(){panel.classList.toggle('open');if(panel.classList.contains('open'))load()};
panel.querySelector('.hsty-x').onclick=function(){panel.classList.remove('open')};
panel.querySelector('form').onsubmit=function(e){e.preventDefault();
var f=e.target,body=f.body.value.trim();if(!body)return;
post({author:f.author.value.trim()||'Anonymous',body:body,quote:quote||undefined});
f.body.value='';quote='';panel.querySelector('.hsty-sel').style.display='none'};
})();`;
