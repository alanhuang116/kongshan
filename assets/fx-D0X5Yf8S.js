import{b0 as I,b1 as J,a8 as tt,k as st,m as ft,S as G,aA as Mt,Z as D,l as V,e2 as zt,s as rt,$ as At,R as St,n as pt,a3 as bt,a0 as mt}from"./index-BK2RdJ5R.js";import{V as q,b as kt,S as it,D as et,M as at,u as Pt,G as $,a2 as Ft,a3 as Lt,I as ut,v as Rt,c as E,a6 as K,C as W,P as gt,a as Z,H as Tt}from"./three-CxPAFleR.js";import"./react-BpaniaUk.js";const Dt=`
attribute vec4 aM; attribute vec4 aN; attribute vec2 aS;
uniform vec4 uAmt;
varying vec3 vW; varying vec4 vM; varying vec4 vN; varying vec2 vS; varying float vZ;
void main() {
  float amt = aM.z < 0.5 ? uAmt.x : aM.z < 1.5 ? uAmt.y : aM.z < 2.5 ? uAmt.z : uAmt.w;
  // 雾多的时候也厚一些（到晨雾那么厚为止；雾天是更浓、更连片，不是更高）
  float thick = aM.x * (0.5 + 0.5 * min(amt, 1.0));
  vec3 w = (modelMatrix * vec4(position, 1.0)).xyz;
  // 板顶不高过眼睛
  float top = min(w.y + thick, cameraPosition.y - 0.45);
  vM = vec4(max(0.0, top - w.y), aM.y, amt, aM.w);
  vN = aN; vS = aS;
  w.y = top;
  vW = w;
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
}
`,Nt=`
${I}
${J}
uniform vec4 uMistP; uniform vec2 uDrift;
varying vec3 vW; varying vec4 vM; varying vec4 vN; varying vec2 vS; varying float vZ;
void main() {
  float amt = vM.z;
  if (vM.x < 0.03 || amt < 0.004) discard;
  vec3 ray = vW - cameraPosition;
  float dist = length(ray);
  vec3 V = ray / dist;
  float d = texture2D(tDepth, gl_FragCoord.xy * uView.xy).x, zn = d * 2.0 - 1.0;
  float scene = 2.0 * uView.z * uView.w / (uView.w + uView.z - zn * (uView.w - uView.z));
  // 视线过了板顶以后，到碰上东西还有多远
  float behind = (scene - vZ) * dist / vZ;
  if (behind <= 0.0) discard;
  // 先粗算在板里走多长，疏密、边缘、远近都取在这段路的中间
  // （雾在板「里面」：板顶那一点往往就在脚边，雾其实在前面十几米处）
  float vy = max(-V.y, 0.035);
  float Lr = min(min(vM.x / vy, behind), uMistP.y);
  vec3 off = V * (Lr * 0.5);
  vec2 pm = vN.xy + vec2(dot(off.xz, vN.zw), dot(off.xz, vec2(-vN.w, vN.z)));
  // 边：一带雾（溪、河）按离中线多远淡出，网格最外一圈再收一收；成片的按顶点上记的
  float e = vM.w > 0.5 ? vM.y * (1.0 - smoothstep(0.3, 1.0, abs(pm.y) / vM.w)) * smoothstep(0.0, 0.22, 1.0 - abs(vN.y) / vM.w) : smoothstep(0.0, 1.0, vM.y);
  if (e < 0.004) discard;
  // 大的疏密（一缕一缕，略带弯）：浓处雾顶高，淡处低
  vec2 q0 = (pm + uDrift) * vS;
  q0 += 0.3 * sin(q0.yx * 1.9 + vec2(1.3, 4.1));
  float n1 = in3(vec3(q0, uTime * 0.011 + vS.y * 40.0));
  // 溪上、河上的雾偏爱水面正上方
  if (vM.w > 0.5) n1 += 0.16 * (1.0 - 2.0 * abs(pm.y) / vM.w);
  // 雾少：只剩几缕；晨雾：成带；雾天：连成一片
  float th = mix(0.6, 0.2, clamp(amt, 0.0, 1.0)) - 0.16 * clamp(amt - 1.0, 0.0, 1.0);
  float big = smoothstep(th, th + 0.5, n1);
  float hT = vM.x * (0.62 + 0.38 * big);
  // 从板顶到这一处的雾顶还空着一截；进了雾以后到碰上东西是 inside，走到底是 full
  float inside = behind - (vM.x - hT) / vy, full = hT / vy;
  if (inside <= 0.0) discard;
  float L = min(min(full, inside), uMistP.y);
  float n = big;
  #ifndef MIST_LOW
    n *= 0.45 + 1.1 * in3(vec3(q0 * 2.9 + 7.0 + uDrift * vS * 0.9, off.y * vS.y * 2.0 + uTime * 0.021));
  #endif
  // 雾顶是虚的：最上面一层薄，往下几十厘米才到足浓——树干是从上往下一点点没进雾里的
  float depthK = clamp(inside * vy / (0.25 + 0.3 * hT), 0.0, 1.0);
  float a = 1.0 - exp(-uMistP.x * (0.35 + 0.65 * min(amt, 2.0)) * n * e * L * depthK);
  // 近处不罩（人身边要看得清）
  a *= smoothstep(uMistP.z, uMistP.w, dist + Lr * 0.5) * 0.9;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uMist, a);
}
`;class Ot{pos=[];arg=[];dom=[];sc=[];idx=[];v(t,s,e,i,n,a,h,o,r,l=0){return this.pos.push(t,s,e),this.arg.push(r.thick,i,r.region,l),this.dom.push(n,a,h,o),this.sc.push(1/r.long,1/r.wide),this.pos.length/3-1}ribbon(t,s){const e=t.length,i=[-1,-.5,0,.5,1];let n=-1,a=0;for(let h=0;h<e;h++){const o=t[Math.max(0,h-1)],r=t[Math.min(e-1,h+1)],l=t[h];let u=r.x-o.x,c=r.z-o.z;const x=Math.hypot(u,c)||1;u/=x,c/=x,h&&(a+=Math.hypot(l.x-t[h-1].x,l.z-t[h-1].z));const m=Math.min(1,Math.min(h,e-1-h)/3),M=this.pos.length/3;for(let w=0;w<5;w++)this.v(l.x-c*l.half*i[w],l.y,l.z+u*l.half*i[w],m,a,l.half*i[w],u,c,s,l.half);if(n>=0)for(let w=0;w<4;w++)this.idx.push(n+w,M+w,M+w+1,n+w,M+w+1,n+w+1);n=M}}sheet(t,s,e,i,n,a,h,o){const r=Math.max(2,Math.round((s-t)/n)),l=Math.max(2,Math.round((i-e)/n)),u=this.pos.length/3;for(let c=0;c<=r;c++)for(let x=0;x<=l;x++){const m=t+(s-t)*c/r,M=e+(i-e)*x/l,w=Math.min(1,Math.min(c,r-c,x,l-x)/1.5)*(o?o(m,M):1);this.v(m,a(m,M),M,w,m,M,1,0,h)}for(let c=0;c<r;c++)for(let x=0;x<l;x++){const m=u+c*(l+1)+x,M=m+l+1;this.idx.push(m,M+1,M,m,m+1,M+1)}}disc(t,s,e,i,n,a,h){const r=this.v(t,n,s,1,t,s,1,0,h),l=[[],[]];for(let u=0;u<20;u++){const c=u/20*Math.PI*2,x=Math.cos(c),m=Math.sin(c);l[0].push(this.v(t+x*e*.6,n,s+m*i*.6,1,t+x*e*.6,s+m*i*.6,1,0,h)),l[1].push(this.v(t+x*(e+a),n,s+m*(i+a),0,t+x*(e+a),s+m*(i+a),1,0,h))}for(let u=0;u<20;u++){const c=(u+1)%20;this.idx.push(r,l[0][c],l[0][u],l[0][u],l[0][c],l[1][c],l[0][u],l[1][c],l[1][u])}}get tris(){return this.idx.length/3}build(){const t=new Pt;return t.setAttribute("position",new $(this.pos,3)),t.setAttribute("aM",new $(this.arg,4)),t.setAttribute("aN",new $(this.dom,4)),t.setAttribute("aS",new $(this.sc,2)),t.setIndex(this.pos.length/3>65535?new Ft(this.idx,1):new Lt(this.idx,1)),t}}class _t{mesh;amount=new q(0,0,0,0);drift=new kt;mat;constructor(t,s={}){this.mat=new it({defines:s.low?{MIST_LOW:1}:{},uniforms:{...tt,uAmt:{value:this.amount},uMistP:{value:new q(s.dens??.5,s.reach??10,s.near?.[0]??3.5,s.near?.[1]??13)},uDrift:{value:this.drift}},vertexShader:Dt,fragmentShader:Nt,transparent:!0,depthTest:!1,depthWrite:!1,side:et}),this.mesh=new at(t,this.mat),this.mesh.layers.set(st),this.mesh.frustumCulled=!1,this.mesh.renderOrder=0,this.mesh.name="mist"}update(t,s){const e=.14+s*1.3;this.drift.x-=e*t,this.drift.y+=e*.12*t,this.mesh.visible=this.amount.x+this.amount.y+this.amount.z+this.amount.w>.004}dispose(){this.mesh.geometry.dispose(),this.mat.dispose()}}const j=28,qt=`
${I}
uniform vec4 uWind;
attribute vec4 aSrc; attribute vec4 aShape; attribute vec4 aLife;
varying vec2 vUv; varying vec4 vA; varying vec3 vF; varying float vZ;
// 一缕烟走的路（s 从 0 起处到 1 散尽处）：x 往上几成、y 顺风出去几成（都以「升多高」为一）。
// 往上是先快后慢（热气散了就不再升），顺风是先慢后快（渐渐被风带上）：起处近乎直立，越高越斜，到顶上平平地铺出去。
// big：是一缕炊烟（1）还是屋里的一小缕水汽（0，几乎不受风）
vec2 track(float s, float big) {
  float rise = (1.0 - exp(-3.4 * s)) / 0.9666;
  return vec2(rise, mix(0.2, 0.45 + 3.0 * uWind.z, big) * (s - 0.92 * rise * 0.2843) + big * (0.35 + 2.0 * uWind.z) * pow(smoothstep(0.5, 1.0, s), 2.0));
}
// 中线。pl：顺着烟走了多远（米）；flow：烟的样子（摆、烟丝）往上走了多远
vec3 centre(float s, float big, float ph0, float flow, out float pl) {
  float h = aShape.y;
  vec2 tr = track(s, big);
  pl = h * (tr.x + tr.y);
  // 摆：烟走的不是直线，袅袅地上去
  float ph = (pl - flow) / mix(0.35, 4.5, big) + ph0;
  vec2 wob = vec2(in3(vec3(ph, ph0, 0.5)), in3(vec3(ph * 0.83 + 9.0, 0.5, ph0))) - 0.5;
  float amp = (aShape.x + h * (0.02 + 0.065 * tr.x)) * smoothstep(0.0, 0.08, s);
  vec3 c = aSrc.xyz + vec3(0.0, h * tr.x + wob.y * amp * 0.4, 0.0);
  c.xz += uWind.xy * (h * tr.y + wob.y * amp) + vec2(-uWind.y, uWind.x) * (wob.x * amp * 2.0);
  return c;
}
void main() {
  float s = position.y, h = aShape.y;
  float big = smoothstep(1.5, 8.0, h), ph0 = aSrc.w * 37.0, pl, p1;
  // 样子往上走的快慢：取这一缕从头走到尾的平均
  vec2 end = track(1.0, big);
  float flow = h * (end.x + end.y) * uTime / aShape.w;
  vec3 c = centre(s, big, ph0, flow, pl);
  vec3 t = normalize(centre(s + 0.03, big, ph0, flow, p1) - centre(s - 0.03, big, ph0, flow, p1));
  // 粗细：起处细，越高越粗；到顶上压扁了平铺出去（横里宽、竖里薄）
  float rad = aShape.x * (1.0 + 1.2 * s) + h * (0.045 * s + 0.09 * pow(s, 2.2));
  float fl = smoothstep(0.35, 0.9, s) * big;
  float ra = rad * (1.0 + 1.5 * fl), rb = rad * (1.0 - 0.6 * fl);
  vec3 hz = cross(t, vec3(0.0, 1.0, 0.0));
  float hl = length(hz);
  hz = hl > 1e-3 ? hz / hl : vec3(1.0, 0.0, 0.0);
  vec3 bz = cross(t, hz);
  vec3 toCam = normalize(cameraPosition - c);
  vec3 side = cross(t, toCam);
  float sl = length(side);
  side /= max(sl, 1e-4);
  float da = ra * dot(side, hz), db = rb * dot(side, bz);
  float hw = sqrt(da * da + db * db);
  vec3 w = c + side * (hw * position.x);
  vec4 v = viewMatrix * vec4(w, 1.0);
  vZ = -v.z;
  gl_Position = projectionMatrix * v;
  vUv = vec2(position.x, s);
  // 烟丝的样子顺着烟走的坐标（炊烟的烟丝三米上下一个起伏，水汽的二十几厘米）；z：升到几成高了
  vF = vec3((pl - flow) / mix(0.25, 3.0, big), aSrc.w * 61.0, track(s, big).x);
  // 浓淡：起处一点点显出来（头二十来厘米；不然像是齐根切断的），越散越淡；烟头、烟尾
  float a = aLife.z * smoothstep(0.0, clamp(0.06 / h, 0.012, 0.12), s) * pow(1.0 - s, 0.55);
  a *= mix(1.0, smoothstep(aLife.x, aLife.x + 0.12, s), step(0.0005, aLife.x)) * (1.0 - smoothstep(aLife.y - min(0.25, aLife.y * 0.6), aLife.y, s));
  // 顺着烟看过去时带子没有宽度：淡掉
  a *= smoothstep(0.03, 0.25, sl);
  // 远了化进雾里
  float fog = inkFogK(c);
  vA = vec4(a * (1.0 - 0.75 * fog), aShape.z, fog, s);
}
`,Ut=`
${I}
${J}
uniform vec3 uPig;
varying vec2 vUv; varying vec4 vA; varying vec3 vF; varying float vZ;
void main() {
  if (vA.x < 0.004) discard;
  float x = vUv.x, s = vUv.y, f = vF.x, sd = vF.y;
  // 起处是一整笔，升到三四成高就分成几根各走各的烟丝
  float open = smoothstep(0.03, 0.42, vF.z), keep = 1.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    // 这一丝在带子里左右游走
    float c = (in3(vec3(f * 0.55 + fi * 7.3, sd + fi * 3.1, 0.5)) - 0.5) * (1.1 + 0.35 * fi) * open;
    // 头一根是主笔：粗一些、不断；另两根细，时浓时淡、时断时续（越往上断得越多）
    float wd = mix(0.72, i == 0 ? 0.42 : 0.2 + 0.07 * fi, open);
    float k = in3(vec3(f * 1.25 + 11.0 + fi * 5.7, sd * 1.7, 3.0 + fi));
    k = smoothstep(0.22 + 0.2 * s, 0.66 + 0.1 * s, k + 0.4 * (1.0 - open));
    if (i == 0) k = 0.62 + 0.38 * k;
    float d = (x - c) / wd;
    keep *= 1.0 - exp(-d * d * 2.4) * k * 0.85;
  }
  // 两层：底下一层淡淡的白（烟本身——衬着深色的山、树、屋看得见，这是留白），
  // 上面几根淡墨的烟丝（衬着天、衬着纸看得见）。先染一道，再提几根丝
  float w = 1.0 - x * x, fil = 1.0 - keep, veil = (0.35 + 0.65 * open) * exp(-x * x * 1.6);
  float a = max(fil * 0.8, veil * 0.5) * w * w * vA.x * fxSeen(vZ, 0.3 + 1.5 * s);
  if (a < 0.004) discard;
  // 柴烟的烟丝：纸 × 淡墨（丝心浓一点）；夜里整缕是比夜色浅的一抹。水汽：比纸白
  vec3 pale = mix(uMist, uLight, 0.4);
  vec3 wood = mix(mix(pale, uPaper * pow(uPig, vec3(0.6 + 0.8 * fil)), smoothstep(0.08, 0.5, fil)), mix(uMist, uLight, 0.22), uNight);
  vec3 col = mix(pale, wood, vA.y);
  col = mix(col, uMist, vA.z);
  gl_FragColor = vec4(col, a);
}
`;class Wt{constructor(t,s,e,i,n,a){this.pos=t,this.amount=s,this.size=e,this.rise=i,this.warm=n,this.life=a}on=!0;dead=!1;strands=[];dispose(){this.dead=!0,this.on=!1}}class Ct{constructor(t=24){this.max=t;const s=new ut,e=new Float32Array((j+1)*2*3),i=[];for(let n=0;n<=j;n++){const a=Math.pow(n/j,1.25);e.set([-1,a,0,1,a,0],n*6),n<j&&i.push(n*2,n*2+1,n*2+3,n*2,n*2+3,n*2+2)}s.setAttribute("position",new Rt(e,3)),s.setIndex(i),this.src=new Float32Array(t*4),this.shape=new Float32Array(t*4),this.life=new Float32Array(t*4),s.setAttribute("aSrc",new E(this.src,4).setUsage(K)),s.setAttribute("aShape",new E(this.shape,4).setUsage(K)),s.setAttribute("aLife",new E(this.life,4).setUsage(K)),s.instanceCount=0,this.geo=s,this.mat=new it({uniforms:{...tt,uPig:{value:new W(.81,.79,.76)}},vertexShader:qt,fragmentShader:Ut,transparent:!0,depthTest:!1,depthWrite:!1,side:et}),this.mesh=new at(s,this.mat),this.mesh.layers.set(st),this.mesh.frustumCulled=!1,this.mesh.renderOrder=2,this.mesh.name="smoke"}mesh;wisps=[];src;shape;life;geo;mat;seed=.137;get tris(){return this.geo.instanceCount*j*2}add(t,s={},e=1,i=!1){let n=0;for(const r of this.wisps)n+=r.strands.length;if(n+e>this.max)return{on:!1,amount:0,pos:t.clone(),dispose(){}};const a=s.size??.07,h=s.rise??.7,o=new Wt(t,s.amount??1,a,h,s.warm??0,1.6+h*1.5);for(let r=0;r<e;r++)this.seed=(this.seed*7.31+.173)%1,o.strands.push({s0:0,s1:i?1:0,amt:i?o.amount:0,seed:this.seed,k:r?.72:1,dx:r?(this.seed-.5)*a*1.6:0,dz:r?(this.seed*3.7%1-.5)*a*1.6:0});return this.wisps.push(o),o}update(t){let s=0;const e=this.src,i=this.shape,n=this.life;for(let h=this.wisps.length-1;h>=0;h--){const o=this.wisps[h],r=t/o.life;let l=!1;for(let u=0;u<o.strands.length;u++){const c=o.strands[u],x=o.on&&o.amount>.004;if(x&&c.s0<=0?c.s1=Math.min(1,c.s1+r):c.s1>0&&(c.s0+=r,c.s0>=c.s1&&(c.s0=0,c.s1=0)),x&&(c.amt+=(o.amount-c.amt)*Math.min(1,t*1.2)),c.s1<=0)continue;l=!0;const m=s*4;e[m]=o.pos.x+c.dx,e[m+1]=o.pos.y,e[m+2]=o.pos.z+c.dz,e[m+3]=c.seed,i[m]=o.size*.5*c.k,i[m+1]=o.rise*(c.k<1?.86:1),i[m+2]=o.warm,i[m+3]=o.life,n[m]=c.s0,n[m+1]=c.s1,n[m+2]=c.amt*(c.k<1?.8:1),n[m+3]=0,s++}o.dead&&!l&&this.wisps.splice(h,1)}const a=this.geo;a.instanceCount=s,s&&(a.attributes.aSrc.needsUpdate=!0,a.attributes.aShape.needsUpdate=!0,a.attributes.aLife.needsUpdate=!0)}dispose(){this.geo.dispose(),this.mat.dispose()}}const B=0,Y=1,H=2,lt=3,_=0,xt=1,nt=2,X=3,ot=4,Q=5,Zt=`
${I}
attribute vec4 aPos; attribute vec4 aArg;
uniform float uPass; uniform vec4 uDab; uniform vec4 uView;
uniform vec3 uKindPig[4]; uniform vec3 uKindAlt[4]; uniform vec4 uKindArg[4];
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying float vZ;
void main() {
  // aArg：x 朝向（相位），y 翻转的快慢（0 就是落定了的），z 透明，w 类别（整数）+ 深浅（小数）
  float air = step(0.0005, abs(aArg.y));
  if (aArg.z < 0.004 || abs(air - uPass) > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 v = viewMatrix * vec4(aPos.xyz, 1.0);
  // 屋顶底下不飘落花落叶（屋里、亭里、檐下）
  float dist = max(-v.z, 0.1), size = aPos.w, alpha = aArg.z * (1.0 - inkRoofFall(aPos.xyz));
  // 远处小得不足一两个像素的：放大到一两个像素，同时调淡（不然一闪一闪）
  float px = size * projectionMatrix[1][1] * 0.5 / (uView.y * dist);
  float k = max(1.0, uDab.x / px);
  size *= k; alpha /= sqrt(k);
  // 贴着镜头飞过的不画（不然一大团粉色糊在眼前）
  alpha *= (1.0 - smoothstep(uDab.y, uDab.z, dist)) * smoothstep(0.8, 2.6, dist);
  float kind = floor(aArg.w), tone = fract(aArg.w) * 1.1;
  float ang = aArg.x + uTime * aArg.y, cs = cos(ang), sn = sin(ang);
  vec2 q = position.xy * size;
  if (air > 0.5) {
    // 飞着：一面转一面侧过身（窄的那一向时宽时窄）
    q.y *= mix(0.45, 1.0, abs(cos(ang * 0.71 + aArg.x * 3.0)));
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  } else {
    // 落定：平躺着，按看过去的角度压扁（不压到成一条线）
    q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
    q.y *= clamp(abs(normalize(cameraPosition - aPos.xyz).y) * 1.3, 0.5, 1.0);
  }
  v.xy += q;
  gl_Position = projectionMatrix * v;
  vUv = position.xy * 2.0;
  int ki = int(kind);
  vec4 ka = uKindArg[ki];
  vP = vec4(mix(uKindPig[ki], uKindAlt[ki], tone), alpha * (1.0 - ka.z * uNight));
  vQ = vec4(kind, ka.x, ka.y * (0.85 + 0.3 * tone), inkFogK(aPos.xyz));
  // 躺着的贴着地：比深度时往前让一点
  vZ = dist - (air > 0.5 ? 0.0 : 0.1 + size);
}
`,It=`
${I}
${J}
varying vec2 vUv; varying vec4 vP; varying vec4 vQ; varying float vZ;
void main() {
  vec2 p = vUv;
  float r;
  if (vQ.x < 0.5) r = length(vec2(p.x, p.y * (1.16 + 0.26 * p.x)));                         // 花瓣：一头圆、一头略尖
  else if (vQ.x < 1.5) r = max(abs(p.x), abs(p.y) / max(0.03, 0.6 * (1.0 - p.x * p.x)));     // 叶：两头尖
  else r = length(p);                                                                         // 水花、露珠：圆点
  // 边上软一个像素
  float aa = min(0.9, fwidth(r) + 0.02);
  float a = (1.0 - smoothstep(1.0 - aa, 1.0, r)) * vP.a * fxSeen(vZ, 0.07);
  if (a < 0.012) discard;
  // 根上深、尖上淡
  float dens = vQ.z * (0.82 + 0.4 * (0.5 - 0.5 * p.x));
  vec3 c = mix(uPaper, uLight, vQ.y) * pow(vP.rgb, vec3(dens));
  c = mix(c, uMist, vQ.w);
  gl_FragColor = vec4(c, a);
}
`;class Vt{constructor(t,s){this.site=s;const e=this.n=Math.max(16,Math.round(t));this.spare=Math.max(12,Math.round(e*.1)),this.P=new Float32Array(e*4),this.A=new Float32Array(e*4),this.vx=new Float32Array(e),this.vy=new Float32Array(e),this.vz=new Float32Array(e),this.age=new Float32Array(e),this.life=new Float32Array(e),this.gy=new Float32Array(e),this.ph=new Float32Array(e),this.u=new Float32Array(e),this.off=new Float32Array(e),this.sz=new Float32Array(e),this.st=new Uint8Array(e),this.kd=new Uint8Array(e);const i=s.stream,n=this.sn=i.length;this.SX=new Float32Array(n),this.SZ=new Float32Array(n),this.SY=new Float32Array(n),this.SW=new Float32Array(n),this.SL=new Float32Array(Math.max(1,n-1));for(let o=0;o<n;o++)this.SX[o]=i[o].x,this.SZ[o]=i[o].z,this.SY[o]=i[o].y??0,this.SW[o]=i[o].w,o&&(this.SL[o-1]=Math.hypot(i[o].x-i[o-1].x,i[o].z-i[o-1].z)||1);const a=new gt(1,1);this.aP=new E(this.P,4).setUsage(K),this.aA=new E(this.A,4).setUsage(K);const h=(o,r,l)=>{const u=new ut;u.index=a.index,u.setAttribute("position",a.attributes.position),u.setAttribute("aPos",this.aP),u.setAttribute("aArg",this.aA),u.instanceCount=0,this.geos.push(u);const c=new it({uniforms:{...tt,uPass:{value:o},uDab:{value:new q(3.2,46,62,0)},uKindPig:{value:[new W(.975,.72,.76),new W(.93,.8,.55),new W(.62,.7,.8),new W(.7,.78,.86)]},uKindAlt:{value:[new W(.95,.58,.65),new W(.86,.64,.48),new W(.7,.76,.84),new W(.76,.83,.9)]},uKindArg:{value:[new q(.74,.95,.35,0),new q(.3,1.2,.2,0),new q(.5,1.6,.1,0),new q(.6,1.1,.1,0)]}},vertexShader:Zt,fragmentShader:It,transparent:!0,depthTest:!1,depthWrite:!1,side:et});this.mats.push(c);const x=new at(u,c);return x.layers.set(st),x.frustumCulled=!1,x.renderOrder=r,x.name=l,x};this.rest=h(0,-5,"drift-rest"),this.fly=h(1,4,"drift-fly")}rest;fly;n;nFly=0;nRest=0;nFloat=0;P;A;vx;vy;vz;age;life;gy;ph;u;off;sz;st;kd;cur=0;checks=0;eye=new Z;look=new Z(0,0,-1);hasEye=!1;live=0;spare;R=ft(20261113);SX;SZ;SY;SW;SL;sn;nd=0;nu=0;nw=0;ny=0;kind=B;src=new Float32Array(0);srcG=new Float32Array(0);srcN=0;nearI=new Int16Array(160);nearN=0;ref=new Z(1e9,0,0);refT=0;uLo=0;uHi=-1;uP=0;spawnAcc=0;floatAcc=0;ripT=0;warmed=!1;pDist=1e9;geos=[];mats=[];aP;aA;get tris(){return this.n*2}near(t,s){const e=this.SX,i=this.SZ,n=this.sn;let a=0,h=1e18;for(let r=0;r<n;r++){const l=e[r]-t,u=i[r]-s,c=l*l+u*u;c<h&&(h=c,a=r)}let o=1e18;for(let r=a-1;r<=a;r++){if(r<0||r>=n-1)continue;const l=e[r+1]-e[r],u=i[r+1]-i[r],c=this.SL[r],x=Math.max(0,Math.min(1,((t-e[r])*l+(s-i[r])*u)/(c*c))),m=t-(e[r]+l*x),M=s-(i[r]+u*x),w=Math.hypot(m,M);w<o&&(o=w,this.nu=r+x,this.nd=(m*-u+M*l)/c,this.nw=this.SW[r]+(this.SW[r+1]-this.SW[r])*x,this.ny=this.SY[r]+(this.SY[r+1]-this.SY[r])*x)}o>1e17&&(this.nu=a,this.nd=1e9,this.nw=0,this.ny=0)}onStream(t,s,e){const i=Math.max(0,Math.min(this.sn-2,Math.floor(s))),n=s-i,a=this.SX,h=this.SZ,o=this.SL[i],r=(a[i+1]-a[i])/o,l=(h[i+1]-h[i])/o,u=t*4;this.P[u]=a[i]+(a[i+1]-a[i])*n-l*e,this.P[u+2]=h[i]+(h[i+1]-h[i])*n+r*e,this.P[u+1]=this.SY[i]+(this.SY[i+1]-this.SY[i])*n+.012}alloc(t){const s=this.n,e=this.st;if(t&&this.live>=s-this.spare)return-1;if(this.live<s)for(let a=0;a<s;a++){const h=(this.cur+a)%s;if(e[h]===_)return this.cur=(h+1)%s,this.live++,h}if(t)return-1;let i=-1,n=-1;for(let a=0;a<s;a++)if(e[a]===nt||e[a]===ot||e[a]===X){const h=this.age[a]/this.life[a];h>n&&(n=h,i=a)}return i}init(t,s,e,i,n,a,h){const o=t*4,r=this.R;this.st[t]=e,this.kd[t]=s,this.age[t]=0,this.ph[t]=r(),this.P[o]=i,this.P[o+1]=n,this.P[o+2]=a,this.P[o+3]=this.sz[t]=h,this.A[o]=r()*6.283,this.A[o+1]=0,this.A[o+2]=0,this.A[o+3]=s+r()*.9,this.vx[t]=this.vy[t]=this.vz[t]=0}sizeOf(t){const s=this.R();return t===B?.075+.05*s:t===Y?.11+.07*s:t===H?.035+.04*s:.03+.015*s}spawnFly(t,s,e,i,n,a,h,o,r=!1){const l=this.alloc(r);return l<0?-1:(this.init(l,t,xt,s,e,i,this.sizeOf(t)),this.vx[l]=n,this.vy[l]=a,this.vz[l]=h,this.gy[l]=o+.9,this.life[l]=60,this.A[l*4+1]=(t===Y?1.6:2.6)*(.6+.8*this.R())*(this.R()<.5?-1:1),l)}spawnShot(t,s,e,i,n,a,h,o,r){const l=this.alloc(!1);return l<0?-1:(this.init(l,t,Q,s,e,i,this.sizeOf(t)),this.vx[l]=n,this.vy[l]=a,this.vz[l]=h,this.gy[l]=o,this.life[l]=r,this.A[l*4+1]=.01,l)}settle(t,s,e,i,n){const a=t*4,h=this.R,o=this.site.pond;if(this.A[a+1]=0,this.age[t]=0,this.vx[t]=0,this.near(s,e),Math.abs(this.nd)<this.nw-.12&&this.ny>i)this.st[t]=X,this.u[t]=this.nu,this.off[t]=this.nd,this.life[t]=34+30*h(),this.onStream(t,this.nu,this.nd);else if(o&&((s-o.x)/o.rx)**2+((e-o.z)/o.rz)**2<.93&&o.y>i)this.st[t]=ot,this.P[a+1]=o.y+.012,this.life[t]=30+30*h();else{this.st[t]=nt,this.P[a+1]=i+.018,this.life[t]=9+10*h();return}!n&&this.ripT<=0&&this.site.ripple&&(this.site.ripple(s,e,.3+.2*h()),this.ripT=2.2)}setSources(t,s){this.kind=t,this.src=s,this.srcN=Math.floor(s.length/4),this.srcG=new Float32Array(this.srcN).fill(NaN),this.nearN=0,this.ref.set(1e9,0,0),this.warmed=!1;let e=1e9,i=-1;for(let n=0;n<this.srcN;n++)this.near(s[n*4],s[n*4+2]),Math.abs(this.nd)<26&&(e=Math.min(e,this.nu),i=Math.max(i,this.nu));this.uLo=e,this.uHi=i<0?-1:Math.min(this.sn-1.01,i+34)}refresh(t){this.ref.copy(t),this.refT=2;const s=this.src,e=this.nearI.length;let i=0,n=0;for(let h=0;h<this.srcN;h++){const o=s[h*4]-t.x,r=s[h*4+2]-t.z;o*o+r*r<1444&&i++}const a=Math.max(1,Math.ceil(i/e));i=0;for(let h=0;h<this.srcN&&n<e;h++){const o=s[h*4]-t.x,r=s[h*4+2]-t.z;o*o+r*r<1444&&i++%a===0&&(this.nearI[n++]=h)}this.nearN=n,this.near(t.x,t.z),this.uP=this.nu,this.pDist=Math.abs(this.nd)}srcGround(t){let s=this.srcG[t];return s!==s&&(s=this.srcG[t]=this.site.ground(this.src[t*4],this.src[t*4+2])),s}pick(t){const s=this.R,e=this.src,i=this.look;let n=0;for(let a=0;a<6;a++){n=this.nearI[Math.floor(s()*this.nearN)%this.nearN];const h=e[n*4]-t.player.x,o=e[n*4+2]-t.player.z,r=e[n*4]-this.eye.x,l=e[n*4+2]-this.eye.z,u=this.hasEye?(r*i.x+l*i.z)/(Math.hypot(r,l)||1):1;if(s()<Math.max(.12,1.2-Math.hypot(h,o)/24)*(u>.35?1:.22))break}return n}drop(t,s){const e=this.R,i=this.src,n=this.pick(t),a=n*4,h=e()*6.283,o=Math.sqrt(e())*i[a+3],r=this.srcGround(n),l=i[a]+Math.cos(h)*o,u=i[a+2]+Math.sin(h)*o,c=i[a+1]+(e()-.45)*i[a+3]*.7,x=t.wind*6.5,m=this.spawnFly(this.kind,l,c,u,t.windDir.x*x*.5,-.2,t.windDir.y*x*.5,r,!0);if(m>=0&&s>0){const M=(c-r-.4)*s,w=M/.75;this.P[m*4]+=t.windDir.x*x*w*.8,this.P[m*4+2]+=t.windDir.y*x*w*.8,this.P[m*4+1]-=M,this.age[m]=1+w,this.vy[m]=-.7}return m}prewarm(t,s,e){const i=this.R,n=this.src;if(this.nearN){for(let h=0;h<s*.85;h++)this.drop(t,i());const a=Math.min(this.n*.42,this.nearN*9);for(let h=0;h<a;h++){const o=this.pick(t),r=o*4,l=i()*6.283,u=Math.sqrt(i())*n[r+3]*1.9,c=n[r]+Math.cos(l)*u+t.windDir.x*1.2,x=n[r+2]+Math.sin(l)*u+t.windDir.y*1.2,m=this.alloc(!0);if(m<0)break;this.init(m,this.kind,nt,c,0,x,this.sizeOf(this.kind)),this.settle(m,c,x,this.site.ground(c,x),!0),this.age[m]=this.life[m]*i()*.8}}for(let a=0;a<e*.9;a++)this.floatOne(i()*.8)}floatOne(t){if(this.uHi<0)return;const s=this.R,e=Math.max(this.uLo,this.uP-11),i=Math.min(this.uHi,this.uP+11);if(i<=e)return;const n=this.alloc(!0);if(n<0)return;const a=e+(i-e)*s(),h=Math.min(this.sn-2,Math.floor(a)),o=this.SW[h];this.init(n,this.kind,X,0,0,0,this.sizeOf(this.kind)),this.u[n]=a,this.off[n]=(s()*2-1)*(o-.3)*.9,this.life[n]=34+30*s(),this.age[n]=this.life[n]*t,this.vx[n]=t>0?0:1,this.onStream(n,a,this.off[n])}burst(t,s,e){const i=this.R;if(t===H||t===lt){const a=this.site.ground(s.x,s.z),h=this.site.pond;this.near(s.x,s.z);let o=a,r=!1;Math.abs(this.nd)<this.nw&&this.ny>a?(o=this.ny,r=!0):h&&((s.x-h.x)/h.rx)**2+((s.z-h.z)/h.rz)**2<1&&h.y>a&&(o=h.y,r=!0);for(let l=0;l<e;l++){const u=i()*6.283;if(t===H){const c=.35+.9*i();this.spawnShot(t,s.x,s.y+.02,s.z,Math.cos(u)*c,1.3+1.5*i(),Math.sin(u)*c,s.y-.02,.9)}else{const c=.25*Math.sqrt(i());this.spawnShot(t,s.x+Math.cos(u)*c,s.y-.1*i(),s.z+Math.sin(u)*c,0,-.3*i(),0,o,2.5)}}r&&this.site.ripple&&(this.site.ripple(s.x,s.z,t===H?1:.4),this.ripT=1.5);return}const n=this.site.ground(s.x,s.z);for(let a=0;a<e;a++){const h=i()*6.283,o=.2+.9*i(),r=.35*Math.sqrt(i());this.spawnFly(t,s.x+Math.cos(h)*r,s.y+(i()-.5)*.5,s.z+Math.sin(h)*r,Math.cos(h)*o,.1+.7*i(),Math.sin(h)*o,n)}}update(t,s,e,i){const n=this.n,a=this.P,h=this.A,o=this.st;this.R;const r=this.site,l=r.pond,u=s.player.x,c=s.player.z;if(this.ripT-=t,this.refT-=t,this.hasEye=!!s.camera,s.camera&&(this.eye.copy(s.camera.position),s.camera.getWorldDirection(this.look),this.look.y=0,this.look.lengthSq()>1e-6?this.look.normalize():this.hasEye=!1),this.srcN&&e>.01){const p=Math.hypot(u-this.ref.x,c-this.ref.z);if(p>6||this.refT<=0){if(p>40&&this.warmed){let f=0;for(let d=0;d<n;d++)o[d]!==_&&o[d]!==Q?o[d]=_:o[d]===Q&&f++;this.live=f,this.warmed=!1}this.refresh(s.player)}const T=Math.min(n*.45,9*this.nearN)*e*(.6+1.5*i),v=this.uHi>=0&&this.pDist<60?Math.min(n*.08,26)*e:0;if(this.warmed||(this.warmed=!0,this.prewarm(s,T,v)),this.nearN){this.spawnAcc+=T/5.5*t;let f=6;for(;this.spawnAcc>=1&&f-- >0;)this.spawnAcc-=1,this.nFly<T*1.5&&this.drop(s,0);this.spawnAcc>4&&(this.spawnAcc=4)}v>0&&this.nFloat<v&&(this.floatAcc+=t*v/20,this.floatAcc>=1&&(this.floatAcc=0,this.floatOne(0)))}const x=s.wind*6.5*(1+.6*i),m=s.windDir.x*x,M=s.windDir.y*x,w=Math.min(1,t*2.4);let L=0,N=0,R=0;this.checks=0;for(let p=0;p<n;p++){const T=o[p];if(T===_)continue;const v=p*4,f=this.age[p]+=t;let d=1;if(T===xt){L++;const y=this.kd[p]===Y,g=this.ph[p],S=Math.sin(f*(y?1.7:2.4)*(.8+.4*g)+g*6.283),U=Math.cos(f*(y?1.15:1.7)+g*11),b=g*19,A=y?.95:.55,F=(y?1:.7)*(.78+.45*g);if(this.vx[p]+=(m+Math.cos(b)*S*A-this.vx[p])*w,this.vz[p]+=(M+Math.sin(b)*S*A-this.vz[p])*w,this.vy[p]+=(-F*(.62+.38*Math.abs(U))-this.vy[p])*w,a[v]+=this.vx[p]*t,a[v+1]+=this.vy[p]*t,a[v+2]+=this.vz[p]*t,d=Math.min(1,f*2.5),a[v+1]<this.gy[p]&&this.checks<8){this.checks++;const k=a[v],P=a[v+2],O=r.ground(k,P);let C=O;this.near(k,P),Math.abs(this.nd)<this.nw-.12&&this.ny>O?C=this.ny:l&&((k-l.x)/l.rx)**2+((P-l.z)/l.rz)**2<.93&&l.y>O&&(C=l.y),a[v+1]<=C+.03?this.settle(p,k,P,O,Math.hypot(k-u,P-c)>30):this.gy[p]=Math.max(C+.03,a[v+1]-.4)}f>this.life[p]&&(o[p]=_)}else if(T===Q){L++;const y=this.kd[p]===lt;this.vy[p]-=(y?7:9.8)*t,a[v]+=this.vx[p]*t,a[v+1]+=this.vy[p]*t,a[v+2]+=this.vz[p]*t;const g=f/this.life[p];d=y?Math.min(1,f*8):1-g*g,(a[v+1]<this.gy[p]||g>=1)&&(o[p]=_)}else{const y=this.life[p]-f;if(d=Math.min(1,this.vx[p]>0?f*.8:1,y/2.5),T===X){R++;const g=Math.max(0,Math.min(this.sn-2,Math.floor(this.u[p]))),S=this.SW[g]-.3,U=this.off[p]/Math.max(.3,S);this.u[p]+=.36*(1-.55*U*U)*t/this.SL[g],this.off[p]=Math.max(-S,Math.min(S,this.off[p]+Math.sin(f*.37+this.ph[p]*40)*.05*t)),this.u[p]>=this.sn-1.02?o[p]=_:this.onStream(p,this.u[p],this.off[p]),h[v]+=t*.12*(this.ph[p]-.5)}else T===ot?(R++,h[v]+=t*.05*(this.ph[p]-.5)):N++;if(y<=0)o[p]=_;else{const g=a[v]-u,S=a[v+2]-c;g*g+S*S>6084&&(o[p]=_)}}h[v+2]=o[p]===_?0:d}this.nFly=L,this.nRest=N,this.nFloat=R,this.live=L+N+R,this.geos[0].instanceCount=N+R>0?n:0,this.geos[1].instanceCount=L>0?n:0,(L+N+R>0||this.dirty)&&(this.aP.needsUpdate=!0,this.aA.needsUpdate=!0),this.dirty=L+N+R>0}dirty=!1;dispose(){for(const t of this.geos)t.dispose();for(const t of this.mats)t.dispose()}}const Bt=`
${I}
attribute vec4 aOff;
uniform vec4 uBox; uniform vec3 uShift; uniform vec4 uDir; uniform vec4 uView; uniform vec4 uLook;
varying vec2 vUv; varying vec2 vA; varying float vZ;
void main() {
  // 三档快慢
  float sp = 0.75 + 0.25 * floor(aOff.w * 2.999);
  vec3 p = aOff.xyz + uShift * sp;
  #ifdef FALL_SNOW
    // 各自飘：左右荡
    float ph = aOff.w * 43.0;
    p.xz += vec2(sin(uTime * (0.45 + 0.5 * aOff.w) + ph), cos(uTime * (0.38 + 0.4 * aOff.w) + ph * 1.7)) * uLook.y;
  #endif
  // 盒子跟着镜头走，里面的东西钉在世界上（出了一头从另一头回来）
  p.xz = mod(p.xz - cameraPosition.xz + uBox.x, 2.0 * uBox.x) - uBox.x + cameraPosition.xz;
  p.y = mod(p.y - cameraPosition.y + uBox.y * 0.42, uBox.y) - uBox.y * 0.42 + cameraPosition.y;
  vec3 toCam = cameraPosition - p;
  float dist = length(toCam), hd = length(toCam.xz);
  float mPerPx = dist * 2.0 * uView.y / projectionMatrix[1][1];
  float fade = (1.0 - smoothstep(uBox.x * 0.72, uBox.x, hd)) * uDir.w;
  #ifdef FALL_SNOW
    float size = uBox.z * (0.6 + 0.8 * fract(aOff.w * 5.7));
    // 不小于一两个像素（太小的放大、调淡）；太近的大而淡
    float k = max(1.0, uBox.w * mPerPx / size);
    size *= k; fade *= smoothstep(0.5, 2.5, dist) / k;
    vec4 v = viewMatrix * vec4(p, 1.0);
    v.xy += position.xy * size;
    vZ = -v.z;
    gl_Position = projectionMatrix * v;
  #else
    // 一笔：顺着落的方向拉长，侧对着看画人；粗细按像素算（远处不细于一个多像素）
    vec3 fall = uDir.xyz;
    vec3 side = normalize(cross(fall, toCam));
    float len = uBox.z * (0.65 + 0.7 * fract(aOff.w * 7.3));
    float wid = max(uLook.x, uBox.w * mPerPx);
    vec3 w = p + fall * (position.y * len) + side * (position.x * wid);
    vec4 v = viewMatrix * vec4(w, 1.0);
    vZ = -v.z;
    gl_Position = projectionMatrix * v;
    // 近的淡（不然几笔粗线横在眼前）
    fade *= smoothstep(1.0, 8.0, dist) * (0.5 + 0.5 * fract(aOff.w * 3.1));
  #endif
  vUv = position.xy * 2.0;
  // 屋顶剖开着往屋里看时，镜头与屋子之间那一段空中的雨雪也不画（看着像落在屋里）
  fade *= mix(1.0, smoothstep(11.0, 17.0, dist), uRoofCut);
  // 屋顶底下不下雨雪（进了草堂、站在亭里，外头照样下）
  vA = vec2(fade * (1.0 - 0.85 * inkFogK(p)) * (1.0 - inkRoofFall(p)), aOff.w);
}
`,Et=`
${I}
${J}
uniform vec3 uInk;
varying vec2 vUv; varying vec2 vA; varying float vZ;
void main() {
  if (vA.x < 0.004) discard;
  #ifdef FALL_SNOW
    float r = length(vUv);
    // 一点软的粉。夜里是月色的白；白天带一点青灰——雪天地是白的、天也是白的，纯白的点落在上面看不见
    // （整片一个颜色：中间白、外面灰的话，落在白地上只剩一个圈）
    float a = (1.0 - smoothstep(0.3, 1.0, r)) * vA.x * fxSeen(vZ, 0.15);
    if (a < 0.006) discard;
    gl_FragColor = vec4(mix(uLight, uPaper * vec3(0.78, 0.83, 0.92), (0.5 + 0.4 * fract(vA.y * 9.7)) * (1.0 - uNight)), a);
  #else
    // 一笔：两头收，中间实；边是软的
    float y = vUv.y * 0.5 + 0.5;
    float a = (1.0 - abs(vUv.x)) * smoothstep(0.0, 0.3, y) * smoothstep(1.0, 0.55, y) * vA.x * fxSeen(vZ, 0.25);
    if (a < 0.006) discard;
    // 白天是淡墨的线，夜里是银白的
    gl_FragColor = vec4(mix(mix(uPaper, uInk, 0.72), uLight * 0.92, uNight), a);
  #endif
}
`;class wt{mesh;geo;mat;shift=new Z;dir=new q(0,-1,0,0);vel=new Z;count;snow;R;H;constructor(t){this.count=Math.max(8,Math.round(t.count)),this.snow=t.snow,this.R=t.R,this.H=t.H;const s=new gt(1,1),e=this.geo=new ut;e.index=s.index,e.setAttribute("position",s.attributes.position);const i=new Float32Array(this.count*4),n=ft(t.snow?77:31);for(let a=0;a<this.count;a++)i[a*4]=(n()*2-1)*t.R,i[a*4+1]=n()*t.H,i[a*4+2]=(n()*2-1)*t.R,i[a*4+3]=n();e.setAttribute("aOff",new E(i,4)),e.instanceCount=0,this.mat=new it({defines:t.snow?{FALL_SNOW:1}:{},uniforms:{...tt,uBox:{value:new q(t.R,t.H,t.size,t.px)},uShift:{value:this.shift},uDir:{value:this.dir},uLook:{value:new q(.004,.32,0,0)}},vertexShader:Bt,fragmentShader:Et,transparent:!0,depthTest:!1,depthWrite:!1,side:et}),this.mesh=new at(e,this.mat),this.mesh.layers.set(st),this.mesh.frustumCulled=!1,this.mesh.renderOrder=6,this.mesh.name=t.snow?"snow":"rain"}get tris(){return this.geo.instanceCount*2}update(t,s,e,i){const n=this.geo;if(s<.012){n.instanceCount=0;return}n.instanceCount=Math.max(1,Math.round(this.count*Math.min(1,.25+.75*s)));const a=this.vel;this.snow?a.set(i.x*e*4.5,-.85,i.y*e*4.5):a.set(i.x*(.6+e*12),-9,i.y*(.6+e*12));const h=this.shift,o=this.R*8,r=this.H*4;h.x=(h.x+a.x*t)%o,h.y=(h.y+a.y*t)%r,h.z=(h.z+a.z*t)%o;const l=a.length()||1;this.dir.set(a.x/l,a.y/l,a.z/l,Math.min(1,s*1.6)*(this.snow?.92:.5))}dispose(){this.geo.dispose(),this.mat.dispose()}}const ct={spring:[6,18.2],summer:[5.1,19.1],autumn:[6.3,17.5],winter:[7,17]},jt=4.3,Gt=4,Ht={wing:-.6,a:-1,b:.25,school:.9,d:.55,e:-.2},ht=(z,t,s,e)=>rt(t-e,t,z)*(1-rt(s,s+e,z));function yt(z,t,s){const e=ct[t][0],i=ct[t][1];return Math.max(ht(z,e+.3+s*.5,e+2+s*.4,.25),.6*ht(z,11.3+s*.3,12.2+s*.3,.2),ht(z,i-1.3+s*.4,i+.7+s*.3,.3))}function Kt(z){const t=new Ot,s=[];for(let r=0;r<D.length;r+=2){const l=D[Math.min(r,D.length-1)];s.push({x:l.x,z:l.z,y:l.y,half:l.w+10})}t.ribbon(s,{thick:2.1,region:0,long:30,wide:9});const e=G.pond;t.disc(e.x,e.z,e.rx,e.rz,e.y,6,{thick:1.5,region:0,long:13,wide:6});let i=1e9,n=-1e9,a=1e9,h=-1e9;for(const r of At)i=Math.min(i,r.x0),n=Math.max(n,r.x1),a=Math.min(a,r.z0),h=Math.max(h,r.z1);const o=(r,l)=>Math.max(V(r,l),pt);if(t.sheet(i-14,n+14,a-2,h+12,9,o,{thick:1.1,region:1,long:34,wide:19}),!z){t.sheet(i-70,n+90,h-4,h+150,16,o,{thick:1.7,region:2,long:70,wide:40});const r=[];for(const l of St)Math.hypot(l.x,l.z-300)<1500&&r.push({x:l.x,z:l.z,y:pt,half:l.w+36});r.length>3&&t.ribbon(r,{thick:3.2,region:2,long:190,wide:64})}return t.build()}function Qt(z){const t=z.q,s=t.tier==="low",e=ft(977);let i=z.season;const n=new Tt;n.name="fx";const a=new _t(Kt(s),{low:s}),h=new Ct(24),o=G.wing,r=[{id:"wing",pos:new Z(o.x+.2,bt+Gt,o.z-o.d*.28)}];G.houses.forEach((v,f)=>{const d=v.w*.3*(f%2?-1:1),y=Math.cos(v.yaw),g=Math.sin(v.yaw);r.push({id:v.id,pos:new Z(v.x+d*y,Mt(v.id)+jt,v.z-d*g)})});let l=null;const u=new Vt(560*t.density,{ground:V,stream:D,pond:G.pond,ripple:z.ripple});let c=null,x=0;const m=()=>{const v=[];if(i==="spring"){if(c){u.setSources(B,c),x=1;return}for(const f of mt)f.kind==="peach"&&v.push(f.x,V(f.x,f.z)+2.5*f.s,f.z,1.7*f.s);x=1,u.setSources(B,new Float32Array(v))}else if(i==="autumn"){for(const f of mt)f.kind==="wood"?v.push(f.x,V(f.x,f.z)+5*f.s,f.z,2.6*f.s):f.kind==="elm"?v.push(f.x,V(f.x,f.z)+7.5*f.s,f.z,4.4*f.s):f.kind==="willow"&&v.push(f.x,V(f.x,f.z)+4.2*f.s,f.z,2.6*f.s);x=.8,u.setSources(Y,new Float32Array(v))}else x=0,u.setSources(B,new Float32Array(0))};m();const M=new wt({snow:!1,count:1300*t.density,R:17,H:15,size:.9,px:1.4}),w=new wt({snow:!0,count:1100*t.density,R:15,H:13,size:.085,px:3.2}),L=new zt(48);n.add(u.rest,a.mesh,h.mesh,L.mesh,u.fly,M.mesh,w.mesh);let N=0,R=0,p=0;const T=v=>{if(!z.ripple)return;const f=G.pond,d=v.player.x,y=v.player.z;if(Math.hypot(d-f.x,y-f.z)<42&&e()<.45){const vt=e()*6.283,dt=Math.sqrt(e())*.86;z.ripple(f.x+Math.cos(vt)*dt*f.rx,f.z+Math.sin(vt)*dt*f.rz,.3+.3*e());return}const g=Math.max(1,Math.min(D.length-2,p+Math.round((e()*2-1)*7))),S=D[g],U=D[g-1],b=D[g+1],A=-(b.z-U.z),F=b.x-U.x,k=Math.hypot(A,F)||1,P=(e()*2-1)*(S.w-.35),O=S.x+A/k*P,C=S.z+F/k*P;Math.hypot(O-d,C-y)<45&&z.ripple(O,C,.3+.3*e())};return{group:n,setSeason(v){v!==i&&(i=v,m())},update(v,f,d){const y=1.3*d.mist+.5*d.rain+.25*d.snow,g=ct[i][0],S=d.hour>g?1-rt(g+1.5,g+4.5,d.hour):0;a.amount.set(.1+.9*d.dawn+.16*S+.45*d.dusk+.4*d.night+y,.02+.62*d.dawn+.06*S+.3*d.dusk+.26*d.night+y*.9,.14+.75*d.dawn+.1*S+.4*d.dusk+.36*d.night+y*.9,0),a.update(v,d.wind),l||(l=r.map((b,A)=>{const F=Ht[b.id]??0,k=yt(d.hour,i,F),P=12.5+4*(A*.618%1),O=h.add(b.pos,{size:.34,rise:P,amount:k,warm:1},s?1:2,k>.02);return O.on=k>.02,{early:F,rise:P,wisp:O}}));for(let b=0;b<l.length;b++){const A=l[b],F=yt(d.hour,i,A.early)*(1-.35*d.rain)*(A.early>.8?.7:1);A.wisp.amount=F,A.wisp.on=F>.02}h.update(v);const U=Math.max(0,Math.min(1,(d.wind-.105)/.07));if(u.update(v,d,x*(1+.4*d.rain)*(1-.6*d.snow),U),M.update(v,d.rain,d.wind,d.windDir),w.update(v,d.snow,d.wind,d.windDir),L.update(d.lamp),d.rain>.05){if(R-=v,R<=0){R=1;let b=1e18;for(let A=0;A<D.length;A++){const F=D[A].x-d.player.x,k=D[A].z-d.player.z,P=F*F+k*k;P<b&&(b=P,p=A)}}N+=v*1.15*d.rain,N>=1&&(N=0,T(d))}},smoke(v,f={}){const d=f.rise??.7;return h.add(v.clone(),{size:f.size??.07,rise:d,amount:f.amount??1,warm:f.warm??0},d>4&&!s?2:1)},burst(v,f,d){v==="petal"?u.burst(B,f,d??14):v==="leaf"?u.burst(Y,f,d??10):v==="splash"?u.burst(H,f,d??10):u.burst(lt,f,d??5)},setBloomSpots(v){const f=Math.max(1,Math.ceil(v.length/1500)),d=[];for(let y=0;y<v.length;y+=f)d.push(v[y].x,v[y].y,v[y].z,1.5);c=d.length?new Float32Array(d):null,i==="spring"&&m()},setLamps(v,f=2.4){L.set(v,f)},setChimneys(v){for(const f of v){const d=r.find(y=>y.id===f.id);d?d.pos.copy(f.pos):r.push({id:f.id,pos:f.pos.clone()})}if(l){for(const f of l)f.wisp.dispose();l=null}}}}export{Qt as createFx};
