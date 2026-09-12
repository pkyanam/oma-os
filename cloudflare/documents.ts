import { documentHTML } from '../lib/browser/document';
import { readablePage } from '../lib/browser/readable';
import ipaddr from 'ipaddr.js';
export function publicDocumentURL(value:string){
  const url=new URL(value), host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!['','80','443'].includes(url.port)||!host.includes('.')||ipaddr.isValid(host)||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host==='metadata.google.internal')throw new Error('Use a public website address on a standard HTTP or HTTPS port.');
  return url;
}
export async function documentResponse(request:Request){
  const target=new URL(request.url).searchParams.get('url');
  if(!target||target.length>4096)return Response.json({error:'A valid website address is required.'},{status:400});
  const signal=AbortSignal.timeout(20000);
  try{
    let url=publicDocumentURL(target);
    for(let redirects=0;redirects<=5;redirects++){
      const response=await fetch(url,{redirect:'manual',signal,headers:{Accept:'text/html,application/xhtml+xml'}});
      if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Website returned an invalid redirect.');url=publicDocumentURL(new URL(location,url).href);continue;}
      if(!response.ok){await response.body?.cancel();throw new Error(`Website returned HTTP ${response.status}.`);}
      if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new Error('This address does not return an HTML page.');}
      const reader=response.body?.getReader();if(!reader)throw new Error('Website returned an empty response.');
      const chunks:Uint8Array[]=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;if((size+=value.byteLength)>2*1024*1024){await reader.cancel();throw new Error('Page exceeds the 2 MB document limit.');}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const html=new TextDecoder().decode(bytes);
      const textOnly=new URL(request.url).searchParams.get('format')==='text';
      return Response.json({...(!textOnly?{html:documentHTML(html,url.href)}:{}),...readablePage(html),url:url.href},{headers:{'Cache-Control':'no-store'}});
    }
    throw new Error('Website redirected too many times.');
  }catch(error){return Response.json({error:error instanceof Error?error.message:'The page could not be loaded.'},{status:422,headers:{'Cache-Control':'no-store'}});}
}
