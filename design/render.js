const {chromium}=require('playwright');const fs=require('fs');
const jobs=[
 ['icon.svg','icon.png',1024,1024,false],
 ['foreground.svg','adaptive-icon.png',1024,1024,true],
 ['monochrome.svg','monochrome-icon.png',1024,1024,true],
 ['notification.svg','notification-icon.png',96,96,true],
 ['default-cover.svg','default-cover.png',512,512,false],
 ['icon.svg','apple-touch-icon.png',180,180,false],
 ['favicon.svg','favicon-32.png',32,32,true],
 ['social.svg','social.png',1280,640,false],
];
(async()=>{const b=await chromium.launch();
for(const [src,out,w,h,transparent] of jobs){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  const svg=fs.readFileSync('out/'+src,'utf8');
  fs.writeFileSync('out/_t.html',`<html><body style="margin:0;background:transparent"><img src="${src}" width="${w}" height="${h}" style="display:block"></body></html>`);
  await p.goto('file://'+process.cwd()+'/out/_t.html');await p.waitForTimeout(200);
  await p.screenshot({path:'out/'+out,omitBackground:transparent});await p.close();}
await b.close();})();
