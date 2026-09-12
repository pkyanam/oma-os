import { authAvailability } from '@/lib/auth/handler';
export function GET(){return Response.json({chatgpt:authAvailability(),direct:true},{headers:{'Cache-Control':'no-store'}});}
