import { authRequest } from '@/lib/auth/request';
import { authHandler,authAvailability } from '@/lib/auth/handler';
export const runtime='nodejs';
export const maxDuration=120;
async function handle(request:Request){if(!authAvailability().enabled)return Response.json({error:'auth_not_configured',message:authAvailability().reason},{status:503});try{const response=await (await authHandler()).handler(authRequest(request));response.headers.set('Cache-Control','no-store');return response;}catch{return Response.json({error:'auth_unavailable',message:'The authentication service is unavailable. Please try again.'},{status:503});}}
export const GET=handle;export const POST=handle;
