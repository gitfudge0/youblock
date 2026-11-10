/** Align a DOM adapter with the corresponding public response-record name. */
export function rendererKind(node:Element):string {
  if(['primary','main','player-container-id'].includes(node.id))return 'videoDetails';
  if(node.matches('.ytp-videowall-still,.ytp-ce-video'))return 'videoRenderer';
  return node.localName.replace(/^(?:ytd|ytm|yt)-/,'').replace(/-([a-z])/g,(_,letter:string)=>letter.toUpperCase());
}
