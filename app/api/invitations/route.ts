import { NextResponse } from "next/server";
import type { DbRow } from "@/lib/db";
import db from "@/lib/db";
import { ensureInvitations, answerInvitation, InvitationError } from "@/lib/workspace-invitations";
import { ensureInAppMessages } from "@/lib/in-app-messages";
import { getSessionUserId } from "@/lib/session";
export async function GET() {
 const userId=await getSessionUserId();
 if(!userId)return NextResponse.json({error:"Silakan login."},{status:401});
 await Promise.all([ensureInvitations(),ensureInAppMessages()]);
 const [invitationRows]=await db.query<DbRow[]>(`SELECT i.id,i.role,i.status,i.created_at,i.project_ids,w.name AS "workspaceName",u.name AS "inviterName"
 FROM workspace_invitations i INNER JOIN workspaces w ON w.id=i.workspace_id INNER JOIN users u ON u.id=i.invited_by
 INNER JOIN users recipient ON recipient.email=i.email WHERE recipient.id=? ORDER BY (i.status='pending') DESC,i.created_at DESC`,[userId]);
 const invitations=await Promise.all(invitationRows.map(async invitation=>{
  let projectIds: number[]=[];
  try{projectIds=JSON.parse(String(invitation.project_ids??"[]")).map(Number).filter(Number.isSafeInteger);}catch{}
  if(!projectIds.length)return {...invitation,projectNames:[]};
  const [projects]=await db.query<DbRow[]>("SELECT name FROM projects WHERE id = ANY(?) ORDER BY name",[projectIds]);
  return {...invitation,projectNames:projects.map(project=>String(project.name))};
 }));
 const [messages]=await db.query<DbRow[]>(`SELECT id,type,title,body,created_at AS "createdAt" FROM in_app_messages WHERE user_id=? ORDER BY created_at DESC LIMIT 100`,[userId]);
 return NextResponse.json({invitations,messages});
}
export async function PATCH(request: Request) {
 const userId=await getSessionUserId();const body=await request.json();
 try{await answerInvitation(userId,Number(body.id),String(body.action));return NextResponse.json({success:true});}
 catch(error){if(error instanceof InvitationError)return NextResponse.json({error:error.message},{status:error.status});throw error;}
}
