// Referência do protótipo: motor de tema automático pela capa.
// Portar para TypeScript em src/lib/theme/ e rodar no servidor (upload da capa),
// lendo os pixels com `sharp` em vez de <canvas>. A lógica de cores é a mesma.
// Depende de: range(a,b) => array de a até b.
const range=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
/* ============ Tema automático a partir da capa ============ */
const THEME_KEYS=['--bg','--surface','--soft','--soft-2','--line','--line-2','--rose','--rose-2','--rose-deep','--rose-tint','--ink','--ink-2','--ink-3','--av1','--av2','--av3','--av4'];
const hex2rgb=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));
const rgb2hex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
function rgb2hsl([r,g,b]){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let hh=0,s=0;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);hh=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;hh*=60}return[hh,s,l]}
function hsl2rgb([hh,s,l]){const k=n=>(n+hh/30)%12,a=s*Math.min(l,1-l),f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));return[f(0)*255,f(8)*255,f(4)*255]}
const hsl=(hh,s,l)=>rgb2hex(hsl2rgb([hh,s,l]));
function lum(x){return hex2rgb(x).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
// escurece (ou clareia) até atingir o contraste mínimo pedido
function fit(hh,s,l,against,target){let c=hsl(hh,s,l),i=0;while(contrast(c,against)<target&&i<100){l=Math.max(0,l-.01);c=hsl(hh,s,l);i++}return c}
function avc(name){let n=0;for(const ch of String(name))n=(n*31+ch.charCodeAt(0))>>>0;return `var(--av${1+n%4})`}

function loadImg(src){return new Promise((ok,err)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=err;im.src=src})}
// 1) reduz a imagem, 2) ignora fundo quase branco e transparente, 3) agrupa cores (k-means)
function extractPalette(img,k=7){
 const W=96,H=Math.max(1,Math.round(W*img.naturalHeight/img.naturalWidth)),cv=document.createElement('canvas');cv.width=W;cv.height=H;
 const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0,W,H);
 const d=cx.getImageData(0,0,W,H).data,px=[];
 for(let i=0;i<d.length;i+=4){if(d[i+3]<200)continue;if(Math.min(d[i],d[i+1],d[i+2])>243)continue;px.push([d[i],d[i+1],d[i+2]])}
 if(px.length<60)return null;
 const byL=px.slice().sort((a,b)=>(a[0]+a[1]+a[2])-(b[0]+b[1]+b[2])),bySat=px.slice().sort((a,b)=>rgb2hsl(b)[1]-rgb2hsl(a)[1]);
 let cents=[...range(0,k-3).map(i=>byL[Math.floor((i+.5)*byL.length/(k-2))]),bySat[0],bySat[Math.floor(bySat.length*.05)]].map(c=>c.slice());
 const asg=new Array(px.length).fill(0);
 for(let it=0;it<14;it++){
  const sum=cents.map(()=>[0,0,0,0]);
  px.forEach((p,i)=>{let best=0,bd=1e12;for(let j=0;j<cents.length;j++){const c=cents[j],dd=(p[0]-c[0])**2*.3+(p[1]-c[1])**2*.59+(p[2]-c[2])**2*.11;if(dd<bd){bd=dd;best=j}}asg[i]=best;const s=sum[best];s[0]+=p[0];s[1]+=p[1];s[2]+=p[2];s[3]++});
  cents=cents.map((c,j)=>sum[j][3]?[sum[j][0]/sum[j][3],sum[j][1]/sum[j][3],sum[j][2]/sum[j][3]]:c);
 }
 const cnt=cents.map(()=>0);asg.forEach(a=>cnt[a]++);
 return cents.map((c,j)=>{const[hh,s,l]=rgb2hsl(c);return{hex:rgb2hex(c),share:cnt[j]/px.length,h:hh,s,l}}).filter(c=>c.share>.01).sort((a,b)=>b.share-a.share);
}
// 4) escolhe a cor de destaque e monta os tokens do tema claro com contraste garantido
function deriveTheme(pal){
 if(!pal)return null;
 const cand=pal.filter(c=>c.s>.22&&c.l>.12&&c.l<.85);if(!cand.length)return null;
 const acc=cand.slice().sort((a,b)=>b.s*(.25+Math.sqrt(b.share))-a.s*(.25+Math.sqrt(a.share)))[0];
 const H=acc.h,s=Math.min(Math.max(acc.s,.45),.78);
 const bg=hsl(H,.4,.985),tint=hsl(H,.7,.94),soft=hsl(H,.55,.96);
 const v={'--bg':bg,'--surface':'#FFFFFF','--soft':soft,'--soft-2':hsl(H,.5,.9),'--line':hsl(H,.3,.9),'--line-2':hsl(H,.28,.82),
  '--rose':fit(H,s,Math.min(acc.l,.58),bg,3),'--rose-2':fit(H,s,.5,'#FFFFFF',4.8),'--rose-deep':fit(H,Math.min(s,.62),.32,tint,7),'--rose-tint':tint,
  '--ink':hsl(H,.22,.11),'--ink-2':fit(H,.12,.4,soft,5.5),'--ink-3':fit(H,.1,.5,soft,4.6)};
 pal.slice().sort((x,y)=>y.s-x.s).slice(0,4).forEach((c,i)=>v['--av'+(i+1)]=hsl(c.h,Math.min(Math.max(c.s,.35),.55),.89));
 for(let i=pal.length;i<4;i++)v['--av'+(i+1)]=tint;
 const checks=[contrast('#FFFFFF',v['--rose-2']),contrast(v['--ink-3'],v['--soft']),contrast(v['--rose-deep'],v['--rose-tint']),contrast(v['--ink'],v['--bg'])];
 return{vars:v,accent:acc,aa:checks.every((c,i)=>c>=[4.5,4.5,4.5,7][i]),checks};
}
function applyTheme(vars){const r=document.documentElement.style;THEME_KEYS.forEach(k=>r.removeProperty(k));if(vars)for(const k in vars)r.setProperty(k,vars[k])}
async function themeFromCover(src){
 try{const img=await loadImg(src);const pal=extractPalette(img);S.theme.palette=pal;S.theme.derived=deriveTheme(pal);}
 catch(e){S.theme.palette=null;S.theme.derived=null}
 if(S.theme.auto)applyTheme(S.theme.derived?S.theme.derived.vars:null);
}
