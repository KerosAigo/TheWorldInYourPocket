const WW=4000, WH=3000;                  // taille de l'espace de base (unités du monde)
const CELL=125;                          // une case de la grille = 125 unités
const FOV=50;                            // champ de vision de la caméra (degrés)
const PITCH=52*Math.PI/180, DIST=1280;   // inclinaison et distance de la caméra en 3D
const DURATION=1.6;                      // durée de la transition 2D <-> 3D (secondes)
const HOME_DELAY=500;                    // délai avant le retour de Delivry au centre (ms)
const BOT_2D=112, BOT_3D=170;            // taille de Delivry en 2D et en 3D
const PHONE=900;                         // en dessous de cette largeur : disposition téléphone
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const note=document.getElementById('note');

/* ---------- Petit état de jeu : DeliVrac et livraisons ---------- */
const KEY='wiyp.mini', IV=20000, CAP=24;       // IV : 20 s par DeliVrac pour tester (3600000 = 1 h)
const RAR=['Commun','Insolite','Rare','Épique','Légendaire'];
const RC=['#9aa7bd','#4fd18b','#4d94ff','#b46bff','#ffc247'];
const COST=[1,2,4,7,12]; let MAXR=1, PAR=1;     // rareté max commandable, livraisons simultanées (améliorables)
let S; try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}
S=S||{dv:3,last:Date.now(),done:0,queue:[],parcels:[]};
S.up=S.up||{par:0,rar:0};
const syncUp=()=>{PAR=1+S.up.par;MAXR=1+S.up.rar};
syncUp();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const hasKey=()=>!!localStorage.getItem('wiyp.sub');   // console : localStorage.setItem('wiyp.sub','1')
function produce(){
  const n=Date.now();
  if(S.dv>=CAP){S.last=n;return}
  const g=Math.floor((n-S.last)/IV);
  if(g>0){S.dv=Math.min(CAP,S.dv+g);S.last=S.dv>=CAP?n:S.last+g*IV;save()}
}
function arrive(){
  const n=Date.now(),r=S.queue.filter(q=>q.ready<=n);
  if(r.length){S.queue=S.queue.filter(q=>q.ready>n);S.parcels.push(...r);S.done+=r.length;save()}
}

/* ---------- Scène, caméra, rendu ---------- */
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
document.body.prepend(renderer.domElement);
const cv=renderer.domElement;

const scene=new THREE.Scene();
scene.fog=new THREE.Fog(0x01061a,1800,5400);

{
  const c=document.createElement('canvas'); c.width=2; c.height=512;
  const g=c.getContext('2d'), gr=g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,'#000'); gr.addColorStop(.5,'#01061a'); gr.addColorStop(1,'#0a2a8a');
  g.fillStyle=gr; g.fillRect(0,0,2,512);
  scene.background=new THREE.CanvasTexture(c);
}

const camera=new THREE.PerspectiveCamera(FOV,innerWidth/innerHeight,10,8000);
camera.up.set(0,0,-1);
const target=new THREE.Vector3(0,0,0);
let pitch=Math.PI/2, dist=1000;
function placeCam(){
  camera.position.set(target.x, Math.sin(pitch)*dist, target.z+Math.cos(pitch)*dist);
  camera.lookAt(target);
  camera.updateMatrixWorld();
}

/* ---------- Sol : grille de points ---------- */
{
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#020c30'; g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(80,150,255,.22)'; g.lineWidth=2; g.strokeRect(0,0,256,256);
  g.fillStyle='rgba(127,252,240,.55)'; g.beginPath(); g.arc(128,128,4,0,6.2832); g.fill();
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(WW/CELL,WH/CELL);
  t.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(WW,WH),new THREE.MeshBasicMaterial({map:t}));
  ground.rotation.x=-Math.PI/2;
  scene.add(ground);

  const e=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-WW/2,1,-WH/2),new THREE.Vector3(WW/2,1,-WH/2),
    new THREE.Vector3(WW/2,1,WH/2),new THREE.Vector3(-WW/2,1,WH/2),new THREE.Vector3(-WW/2,1,-WH/2)]);
  scene.add(new THREE.Line(e,new THREE.LineBasicMaterial({color:0x7ffcf0,transparent:true,opacity:.5})));
}

/* ---------- Delivry : sprite qui fait toujours face à la caméra ---------- */
const bot=new THREE.Vector3(0,0,0);
let aw=1, ah=1;
const radial=(stops)=>{
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d'), gr=g.createRadialGradient(64,64,0,64,64,64);
  stops.forEach(([o,col])=>gr.addColorStop(o,col));
  g.fillStyle=gr; g.fillRect(0,0,128,128);
  return new THREE.CanvasTexture(c);
};
const shadow=new THREE.Mesh(new THREE.CircleGeometry(1,32),
  new THREE.MeshBasicMaterial({map:radial([[0,'rgba(0,0,0,.65)'],[1,'rgba(0,0,0,0)']]),transparent:true,depthWrite:false,fog:false}));
shadow.rotation.x=-Math.PI/2; shadow.position.y=.6; scene.add(shadow);

const glow=new THREE.Sprite(new THREE.SpriteMaterial({
  map:radial([[0,'rgba(90,150,255,.55)'],[1,'rgba(90,150,255,0)']]),
  blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));
scene.add(glow);

const sprite=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,fog:false,depthWrite:false}));
scene.add(sprite);

function tex(src){
  return new Promise(res=>{
    const im=new Image();
    im.onload=()=>{
      const t=new THREE.Texture(im);
      t.magFilter=THREE.NearestFilter; t.minFilter=THREE.NearestFilter;
      t.generateMipmaps=false; t.needsUpdate=true; res(t);
    };
    im.onerror=()=>res(null);
    im.src=src;
  });
}
function emojiTex(){
  const c=document.createElement('canvas'); c.width=c.height=128;
  const g=c.getContext('2d'); g.font='96px system-ui'; g.textAlign='center'; g.textBaseline='middle';
  g.fillText('🤖',64,70); return new THREE.CanvasTexture(c);
}
async function showDelivry(cr,from){
  if(!cr||!cr.anims||!cr.anims[0]||!cr.anims[0].frames.length){
    sprite.material.map=emojiTex(); sprite.material.needsUpdate=true;
    note.textContent='Aucun design "delivry" trouvé ('+from+')'; return;
  }
  const a=cr.anims[0], ts=(await Promise.all(a.frames.map(tex))).filter(Boolean);
  if(!ts.length){note.textContent='Image illisible dans le JSON'; return}
  const m=Math.max(cr.w,cr.h); aw=cr.w/m; ah=cr.h/m;
  sprite.material.map=ts[0]; sprite.material.needsUpdate=true;
  note.textContent='Design chargé depuis '+from+' ('+cr.w+'×'+cr.h+')';
  if(ts.length>1){let i=0; setInterval(()=>{i=(i+1)%ts.length; sprite.material.map=ts[i]},1000/Math.max(1,a.fps||6))}
}
function fromLocal(why){
  try{showDelivry((JSON.parse(localStorage.getItem('wiyp.sys'))||{}).delivry,'le stockage du navigateur ('+why+')')}
  catch(e){showDelivry(null,why)}
}
fetch('assets/pack.json',{cache:'no-store'})
  .then(r=>{if(!r.ok) throw new Error('HTTP '+r.status); return r.json()})
  .then(p=>p.delivry?showDelivry(p.delivry,'assets/pack.json'):fromLocal('pas de clé delivry dans pack.json'))
  .catch(e=>fromLocal('pack.json illisible : '+e.message));

/* ---------- Environnement expérimental : une usine ---------- */
let env='base', locked=false, P=null;        // env : monde affiché · locked : interactions bloquées · P : portail en cours
const fscene=new THREE.Scene();
fscene.fog=new THREE.Fog(0x140c07,1800,5400);
{
  const c=document.createElement('canvas'); c.width=2; c.height=512;
  const g=c.getContext('2d'), gr=g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,'#050302'); gr.addColorStop(.55,'#150c06'); gr.addColorStop(1,'#4a2208');
  g.fillStyle=gr; g.fillRect(0,0,2,512);
  fscene.background=new THREE.CanvasTexture(c);
}
const mkTex=(w,h,draw,rx=1,ry=1)=>{
  const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.anisotropy=renderer.capabilities.getMaxAnisotropy(); return t;
};
const stripes=(g,w,h)=>{                      // bandes jaunes et noires de sécurité
  g.fillStyle='#15171a'; g.fillRect(0,0,w,h); g.fillStyle='#e0b000';
  for(let i=-h;i<w+h;i+=32){g.beginPath();g.moveTo(i,h);g.lineTo(i+16,h);g.lineTo(i+16+h,0);g.lineTo(i+h,0);g.closePath();g.fill()}
};
const plate=(g,w,h)=>{                        // tôle larmée
  g.fillStyle='#454b53'; g.fillRect(0,0,w,h);
  for(let i=0;i<700;i++){g.fillStyle=`rgba(${Math.random()<.5?'0,0,0':'255,255,255'},${Math.random()*.06})`;g.fillRect(Math.random()*w,Math.random()*h,2,2)}
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    g.save();g.translate(x*64+32,y*64+32);g.rotate((x+y)%2?Math.PI/4:-Math.PI/4);
    g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-14,-2,28,6);g.fillStyle='rgba(255,255,255,.16)';g.fillRect(-14,-4,28,5);g.restore();
  }
  g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=3;g.strokeRect(0,0,w,h);
  g.fillStyle='rgba(20,22,26,.9)';
  [[10,10],[w-10,10],[10,h-10],[w-10,h-10]].forEach(([x,y])=>{g.beginPath();g.arc(x,y,4,0,6.3);g.fill()});
};

/* Sol, bandes de sécurité et murs */
{
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(WW,WH),
    new THREE.MeshPhongMaterial({map:mkTex(256,256,plate,WW/CELL,WH/CELL),specular:0x222222,shininess:18}));
  fl.rotation.x=-Math.PI/2; fscene.add(fl);
  const strip=(x,z,lx,lz)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(lx,lz),new THREE.MeshLambertMaterial({map:mkTex(64,64,stripes,lx/48,lz/48)}));
    m.rotation.x=-Math.PI/2; m.position.set(x,1.5,z); fscene.add(m);
  };
  strip(0,-WH/2+70,WW-140,44); strip(0,WH/2-70,WW-140,44); strip(-WW/2+70,0,44,WH-140); strip(WW/2-70,0,44,WH-140);
  const wm=new THREE.MeshLambertMaterial({color:0x2e343b});
  [[0,-WH/2-30,WW+120,60],[0,WH/2+30,WW+120,60],[-WW/2-30,0,60,WH],[WW/2+30,0,60,WH]].forEach(([x,z,w,d])=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,260,d),wm); m.position.set(x,130,z); fscene.add(m);
  });
}
fscene.add(new THREE.AmbientLight(0xc8b8a8,1.25));
{ const dl=new THREE.DirectionalLight(0xffe0c0,.5); dl.position.set(-500,1000,400); fscene.add(dl); }

/* Delivry dans l'usine : mêmes matériaux que dans l'espace de base */
const shadow2=new THREE.Mesh(shadow.geometry,shadow.material); shadow2.rotation.x=-Math.PI/2; shadow2.position.y=.6;
const glow2=new THREE.Sprite(glow.material), sprite2=new THREE.Sprite(sprite.material);
fscene.add(shadow2,glow2,sprite2);

/* Rendu du portail : l'usine est dessinée dans une texture, vue à travers un disque irrégulier lumineux */
const rt=new THREE.WebGLRenderTarget(2,2,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
function sizeRT(){const pr=renderer.getPixelRatio();rt.setSize(Math.floor(innerWidth*pr),Math.floor(innerHeight*pr))}
sizeRT();
const PU={tMap:{value:rt.texture},uC:{value:new THREE.Vector2()},uR:{value:0},uT:{value:0},uRes:{value:new THREE.Vector2(1,1)}};
const qscene=new THREE.Scene(), qcam=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
{
  const q=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
    uniforms:PU,transparent:true,depthTest:false,depthWrite:false,
    blending:THREE.CustomBlending,blendEquation:THREE.AddEquation,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,
    vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      uniform sampler2D tMap; uniform vec2 uC; uniform vec2 uRes; uniform float uR; uniform float uT;
      void main(){
        vec2 p=gl_FragCoord.xy, d=p-uC; float dist=length(d), a=atan(d.y,d.x);
        float wob=1.+.04*sin(a*7.+uT*6.)+.025*sin(a*13.-uT*9.)+.02*sin(a*3.+uT*2.);
        float e=dist-uR*wob;
        float inside=1.-smoothstep(-1.5,1.5,e);
        vec2 dir=d/max(dist,1e-3);
        float near=exp(-abs(e)/(uR*.1+8.));
        vec2 uv=p/uRes+vec2(-dir.y,dir.x)*near*.02*sin(a*9.+uT*8.);
        vec3 col=texture2D(tMap,uv).rgb*inside;
        float g=exp(-abs(e)/(3.+uR*.015))+.35*exp(-abs(e)/(18.+uR*.05));
        vec3 rc=mix(vec3(1.,.55,.1),vec3(.25,.9,1.),.5+.5*sin(a*4.+uT*5.));
        col+=rc*g*1.3+vec3(1.)*exp(-abs(e)/1.8)*.8;
        gl_FragColor=vec4(col,inside);
      }`
  }));
  q.frustumCulled=false; qscene.add(q);
}

/* ---------- Mode 2D / 3D ---------- */
let m=0, goal=0, e=0;
const btn=document.getElementById('mode');
btn.onclick=()=>{
  if(locked)return;
  goal=goal?0:1;
  btn.textContent=goal?'Retour en 2D':'Passer en 3D';
  btn.setAttribute('aria-pressed',goal?'true':'false');
  later();
};

/* ---------- Clic sur Delivry : zone cliquable calculée à l'écran ---------- */
const _v=new THREE.Vector3(), _u=new THREE.Vector3();
function hitBot(ev){
  _v.copy(sprite.position).project(camera);
  const cx=(_v.x+1)/2*innerWidth, cy=(1-_v.y)/2*innerHeight;
  _u.setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(sprite.scale.y/2).add(sprite.position).project(camera);
  const r=Math.max(40,Math.hypot((_u.x-_v.x)/2*innerWidth,(_u.y-_v.y)/2*innerHeight));
  return Math.hypot(ev.clientX-cx,ev.clientY-cy)<=r;
}

/* ---------- Terminal de la tablette ---------- */
const Term=(()=>{
  const MODS=[['scanner','recherche de colis'],['upgrades','améliorations de Delivry'],['contributor','options de contributeur']];
  const UPS=[
    {k:'colis',f:'par',n:'livraisons simultanées',s:[[5,3],[12,10],[25,25]],d:l=>`${1+l} → ${2+l} colis en même temps`},
    {k:'rarete',f:'rar',n:'rareté commandable',s:[[8,5],[20,15],[40,30]],d:l=>`${RAR[1+l]} → ${RAR[2+l]}`}
  ];
  const SUBMODS=[['marche_noir','marché des papiers entre joueurs']];
  const SUB=true;                       // true : l'utilisateur est abonné. false : il voit la page d'offre.
  const ACCESS_KEY='M0d3R4t0r';
  let unlocked=false,cur=null;
  const COLS=27, ROWS=13, CX=13, CY=6;
  let log=null,pr=null,pp=null,inp=null,outEl=null,rad=null,inf=null;
  let view='menu',gen=0,busy=false,offers=[],sel=-1,t0=0,rt=0,sigI='',hist=[],hi=0;

  const h=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
  const coarse=()=>matchMedia('(hover:none) and (pointer:coarse)').matches;
  const can=o=>o&&o.r<=MAXR&&S.dv>=o.c&&S.queue.length<PAR;
  const path=()=>view==='scan'?'PS C:\\DELIVRY\\scanner>':view==='up'?'PS C:\\DELIVRY\\upgrades>'
    :view==='mod'?'PS C:\\DELIVRY\\upgrades\\modules>':(view==='offer'||view==='key')?'PS C:\\DELIVRY\\contributor>':'PS C:\\DELIVRY>';
  const cmds=()=>view==='scan'?['1','2','3','4','select','rechercher','commander','retour','help','cls','exit']
    :view==='up'?['colis','rarete','modules','retour','help','cls','exit']
    :view==='mod'?['marche_noir','retour','help','cls','exit']
    :view==='offer'?['s_abonner','retour','help','cls','exit']
    :view==='key'?['cle_oublie','retour','help','cls','exit']
    :['scanner','upgrades','contributor','help','cls','exit'];
  const pad=(s,n)=>String(s).padEnd(n);
  const hang=(n,el)=>{el.style.paddingLeft=n+'ch';el.style.textIndent='-'+n+'ch';return el};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  /* ----- affichage ----- */
  function put(d){
    if(view==='scan'&&outEl&&outEl.isConnected)outEl.append(d);else log.insertBefore(d,pr);
    log.scrollTop=log.scrollHeight;
  }
  function line(t,c){const d=h('div','l'+(c?' '+c:''),t);put(d);return d}
  function echo(v){const d=h('div','l');d.append(h('span','pp',path()+' '),h('span','cmd',v));put(d)}
  function cls(){[...log.children].forEach(n=>{if(n!==pr)n.remove()});outEl=null}
  function setPrompt(){
    pp.textContent=path();
    const typed=!coarse()||view==='key';
    inp.style.display=typed?'':'none';cur.style.display=typed?'none':'';
    inp.type=view==='key'?'password':'text';
    inp.placeholder=view==='key'?"entrer la clé d'accès ...":view==='scan'?'entrer une commande ...':"entrer l'option choisie ...";
    if(typed)setTimeout(()=>inp.focus(),60);
  }


  /* ----- montage ----- */
  function stop(){clearInterval(rt);rt=0;gen++;busy=false}
  function mount(main){
    stop();main.innerHTML='';view='menu';outEl=null;unlocked=false;
    log=h('div','ps');main.append(log);
    pr=h('div','pl');pp=h('span','pp','');
    inp=h('input');inp.autocomplete='off';inp.spellcheck=false;inp.autocapitalize='off';inp.onkeydown=key;
    cur=h('span','cur','sélectionner une option');
    pr.append(pp,inp,cur);log.append(pr);
    log.onclick=()=>{if(inp.style.display!=='none'&&!String(getSelection()).length)inp.focus()};
    setPrompt();
    line('Windows PowerShell','hd');
    line('Copyright (C) Delivry Corporation. Tous droits réservés.','dim');
    line('');
    echo('help');help();
  }
  function key(ev){
    if(ev.key==='Enter'){ev.preventDefault();const v=inp.value;inp.value='';submit(v)}
    else if(ev.key==='ArrowUp'){ev.preventDefault();if(hist.length){hi=Math.max(0,hi-1);inp.value=hist[hi]}}
    else if(ev.key==='ArrowDown'){ev.preventDefault();hi=Math.min(hist.length,hi+1);inp.value=hist[hi]||''}
    else if(ev.key==='Tab'){
      ev.preventDefault();const w=inp.value.trim().toLowerCase();
      if(w){const m=cmds().filter(c=>c.startsWith(w));if(m.length===1)inp.value=m[0]}
    }
  }

  /* ----- exécution ----- */
  function submit(v){
    if(busy)return;
    v=String(v).trim();
    if(view==='scan'&&outEl)outEl.innerHTML='';
    const secret=view==='key'&&v!=='cle_oublie'&&v!=='retour';
    echo(secret?'*'.repeat(v.length):v);             // la clé n'est jamais réaffichée
    if(v&&view!=='key'){hist.push(v);hi=hist.length}
    exec(v);
  }
  function exec(raw){
    if(view==='key')return execKey(raw);
    const [w,...rest]=raw.toLowerCase().split(/\s+/);
    if(!w)return;
    if(w==='help'||w==='?')return help();
    if(w==='cls'||w==='clear')return view==='scan'?drawScan(false):cls();
    if(w==='exit')return Tab.close();
    if(view==='scan')return execScan(w,rest,raw);
    if(view==='up')return execUp(w,raw);
    if(view==='mod')return execMod(w,raw);
    if(view==='offer')return execOffer(w,raw);
    if(w==='scanner')return openScan();
    if(w==='upgrades')return goto('up');
    if(w==='contributor'){
      if(SUB)return goto('key');
      view='offer';setPrompt();return offerHelp(true);
    }
    unknown(raw);
  }
  function unknown(raw){
    const w=raw.split(/\s+/)[0];
    line(`${w} : Le terme « ${w} » n'est pas reconnu comme nom d'applet de commande, fonction, fichier de script ou programme exécutable.`,'err');
    line('Au caractère Ligne:1 : 1','err');
    line('+ '+raw,'err');
    line('+ '+'~'.repeat(Math.min(raw.length,30)),'err');
    line(`    + CategoryInfo          : ObjectNotFound: (${w}:String) [], CommandNotFoundException`,'err');
  }

  /* ----- menu ----- */
  function help(){
    if(view==='offer')return offerHelp();
    if(view==='key')return keyHelp();
    if(view==='up')return upHelp();
    if(view==='mod')return modHelp();
    if(view==='scan'){
      line('Commandes disponibles :','hd');
      [['1-4 | select N','sélectionner un contact'],['rechercher','lancer un nouveau scan'],
       ['commander','commander le contact sélectionné'],['retour','revenir au menu'],['cls | exit','effacer | fermer']]
        .forEach(([a,b])=>put(hang(16,h('div','l dim','  '+pad(a,16)+b))));
      return;
    }
    line('Name        Type    Description','hd');
    line('----        ----    -----------','dim');
    MODS.forEach(([k,d])=>{
      const lock=k==='contributor'&&!SUB;
      const n=h(coarse()?'button':'div','l row'+(lock?' lock':''));
      n.append(h('span','nm',pad(k,12)),document.createTextNode(pad(lock?'Locked':'Module',8)+d));
      if(coarse())n.onclick=()=>submit(k);
      put(hang(20,n));
    });
    line('');
    line(coarse()?'Touchez un module pour l\'ouvrir.':'Tapez le nom d\'un module puis Entrée. Tab complète, ↑ rappelle.','dim');
  }

  /* ----- navigation entre sous-menus ----- */
  function goto(v){view=v;setPrompt();help()}

  /* ----- upgrades ----- */
  function upHelp(){
    line('AMÉLIORATIONS DE DELIVRY','hd');
    line(`▣ ${Math.floor(S.dv)} DeliVrac · ${S.done} livraison${S.done>1?'s':''} effectuée${S.done>1?'s':''}`,'dim');
    line('');
    line('Name    Niv  Coût  Livr Effet','hd');
    line('----    ---  ----  ---- -----','dim');
    UPS.forEach(u=>{
      const l=S.up[u.f],max=l>=u.s.length;
      const ok=!max&&S.dv>=u.s[l][0]&&S.done>=u.s[l][1];
      const txt=pad(u.k,8)+pad(l+'/'+u.s.length,5)+(max?'MAX':pad('◆'+u.s[l][0],6)+pad(u.s[l][1],5)+u.d(l));
      const n=h(coarse()?'button':'div','l row'+(ok||max?'':' dim'),txt);
      if(coarse())n.onclick=()=>submit(u.k);
      put(hang(24,n));
    });
    const m=h(coarse()?'button':'div','l row',pad('modules',8)+'gérer les modules accessibles');
    if(coarse())m.onclick=()=>submit('modules');
    put(hang(8,m));
    const r=h(coarse()?'button':'div','l row',pad('retour',8)+'revenir au menu');
    if(coarse())r.onclick=()=>submit('retour');
    put(hang(8,r));
    line('');
    line(coarse()?'Touchez une ligne pour installer ou ouvrir.':'Tapez colis, rarete ou modules puis Entrée. « retour » revient au menu.','dim');
  }
  function execUp(w,raw){
    const u=UPS.find(x=>x.k===w||x.k==='rarete'&&w==='rareté');
    if(u)return install(u);
    if(w==='modules'||w==='module')return goto('mod');
    if(w==='retour'||w==='back'){view='menu';setPrompt();return help()}
    unknown(raw);
  }
  function install(u){
    const l=S.up[u.f];
    if(l>=u.s.length)return line(`Le module ${u.k} est déjà au niveau maximum.`,'warn');
    const [c,n]=u.s[l];
    if(S.dv<c)return line(`Erreur : DeliVrac insuffisant (${Math.floor(S.dv)}/${c}).`,'err');
    if(S.done<n)return line(`Erreur : ${n} livraisons requises (${S.done} effectuée${S.done>1?'s':''}).`,'err');
    S.dv-=c;S.up[u.f]++;syncUp();save();Tab.dv();
    line(`Installation de « ${u.n} »... terminé. ${u.d(l)}.`,'ok');
    line('');upHelp();
  }

  /* ----- gestion des modules ----- */
  function modHelp(){
    line('MODULES ACCESSIBLES','hd');
    line('');
    line('Name        Type    Description','hd');
    line('----        ----    -----------','dim');
    SUBMODS.forEach(([k,d])=>{
      const n=h(coarse()?'button':'div','l row');
      n.append(h('span','nm',pad(k,12)),document.createTextNode(pad('Module',8)+d));
      if(coarse())n.onclick=()=>submit(k);
      put(hang(20,n));
    });
    const r=h(coarse()?'button':'div','l row',pad('retour',12)+'revenir aux améliorations');
    if(coarse())r.onclick=()=>submit('retour');
    put(hang(12,r));
    line('');
    line(coarse()?'Touchez un module pour l\'ouvrir.':'Tapez le nom d\'un module puis Entrée. « retour » revient aux améliorations.','dim');
  }
  function execMod(w,raw){
    if(/^march[eé]/.test(w))return line('AVERTISSEMENT : le module marche_noir est en cours d\'installation. Bientôt.','warn');
    if(w==='retour'||w==='back')return goto('up');
    unknown(raw);
  }

  /* ----- contributor ----- */
  function links(items){                     // mobile : commandes cliquables
    if(!coarse())return;
    const bar=h('div','cmds');
    items.forEach(c=>{const x=h('button','lkb','['+c+']');x.onclick=()=>submit(c);bar.append(x)});
    put(bar);
  }
  function offerHelp(open){
    line('CONTRIBUTEUR — OFFRE D\'ABONNEMENT','hd');
    line('Aucun abonnement détecté sur ce compte.');
    if(open){
      line('Ouverture de la page de l\'offre dans un nouvel onglet...','dim');
      if(!window.open('offer.html','_blank'))line('Le navigateur a bloqué l\'ouverture. Utilisez le lien ci-dessous.','warn');
    }
    const d=h('div','l'),a=h('a','lkb','[ouvrir la page de l\'offre]');a.href='offer.html';a.target='_blank';d.append(a);put(d);
    line('');
    if(coarse())links(['s_abonner','retour']);
    else line('Commandes : s_abonner · retour','dim');
  }
  function keyHelp(){
    line('CONTRIBUTEUR — AUTHENTIFICATION','hd');
    line('Une clé d\'accès est requise. Elle vous a été envoyée par e-mail lors de votre abonnement.');
    line('Saisissez-la ci-dessous, ou tapez cle_oublie pour la recevoir de nouveau.','dim');
    line('');
    if(coarse())links(['cle_oublie','retour']);
  }
  function execOffer(w,raw){
    if(w==='s_abonner'){
      line('Ouverture de la page de l\'offre...','dim');
      if(!window.open('offer.html','_blank'))line('Le navigateur a bloqué l\'ouverture. Utilisez le lien.','warn');
      return;
    }
    if(w==='retour'||w==='back')return goto('menu');
    unknown(raw);
  }
  function execKey(raw){
    if(!raw)return;
    if(raw===ACCESS_KEY)return unlock();             // la clé est sensible à la casse
    const w=raw.toLowerCase();
    if(w==='cle_oublie')return line('Un e-mail contenant votre clé d\'accès a été envoyé à l\'adresse de votre compte. (simulation du prototype)','ok');
    if(w==='retour'||w==='back')return goto('menu');
    if(w==='help'||w==='?')return help();
    if(w==='cls'||w==='clear')return cls();
    if(w==='exit')return Tab.close();
    line('Accès refusé : clé invalide. Tapez cle_oublie pour la recevoir par e-mail.','err');
  }
  function unlock(){
    unlocked=true;busy=true;view='apps';
    line('Clé valide. Authentification réussie.','ok');
    line('Ouverture de l\'interface contributeur...','dim');
    setTimeout(()=>Tab.flip(),700);
  }

  /* ----- scanner ----- */

  async function openScan(){
    const g=gen;busy=true;
    line('Initialisation du module scanner...');
    const bar=line('','ok');
    for(let i=0;i<=20;i++){
      if(g!==gen)return;
      bar.textContent='['+'█'.repeat(i)+'░'.repeat(20-i)+'] '+i*5+'%';
      await sleep(35);
    }
    await sleep(150);
    if(g!==gen)return;
    busy=false;view='scan';newOffers();drawScan(true);
  }
  function newOffers(){
    const W=[10,6,3,1.5,.6],out=[],used={};
    while(out.length<4){
      let x=Math.random()*W.reduce((a,b)=>a+b,0),r=0;
      for(;r<4;r++){x-=W[r];if(x<=0)break}
      const dim=1+Math.floor(Math.random()*4),s=5*dim+4*r,f=.3+.56*clamp((s-5)/35,0,1);
      let a=out.length*1.571+.55+Math.random()*.5,gx,gy,n=0;
      do{gx=Math.round(CX+Math.cos(a)*f*13);gy=Math.round(CY+Math.sin(a)*f*6.5);a+=.4}while(used[gy*COLS+gx]&&++n<20);
      used[gy*COLS+gx]=1;
      out.push({r,c:COST[r],s,gx,gy});
    }
    offers=out;sel=-1;
  }
  function drawScan(fresh){
    clearInterval(rt);cls();setPrompt();
    line('DELIVRY SCANNER — SCAN MULTIVERS','hd');
    const blk=h('div','blk');rad=h('pre','rad');inf=h('div','inf');blk.append(rad,inf);put(blk);
    const o=h('div','out');put(o);outEl=o;
    t0=fresh?Date.now():Date.now()-6000;
    if(fresh){
      line(offers.length+' contacts détectés.','ok');
      if(!coarse())line('Tapez 1-4 pour sélectionner · rechercher · commander · retour · help','dim');
    }
    rt=setInterval(frame,110);frame();info();
  }
  function frame(){
    if(!rad||!rad.isConnected)return;
    const el=(Date.now()-t0)/1000,sa=(el/3.4*6.2832)%6.2832,cell={},brk={};
    offers.forEach((o,k)=>{if(el>=.9+k*.3)cell[o.gy*COLS+o.gx]=k});
    const so=offers[sel];
    if(so&&cell[so.gy*COLS+so.gx]!==undefined){brk[so.gy*COLS+so.gx-1]='[';brk[so.gy*COLS+so.gx+1]=']'}
    let html='';
    for(let r=0;r<ROWS;r++){
      for(let c=0;c<COLS;c++){
        const i=r*COLS+c,dx=c-CX,dy=(r-CY)*2,d=Math.hypot(dx,dy);
        if(cell[i]!==undefined){
          const k=cell[i],o=offers[k];
          html+=`<b class="k${o.r>MAXR?' lk':''}" style="color:${RC[o.r]}">${k+1}</b>`;continue;
        }
        if(brk[i]){html+=`<b class="sl">${brk[i]}</b>`;continue}
        if(d>13.4){html+=' ';continue}
        if(!dx&&!dy){html+='+';continue}
        let dl=(sa-Math.atan2(dy,dx))%6.2832;if(dl<0)dl+=6.2832;
        if(dl<.9){html+=`<b class="sw">${dl<.15?'▓':dl<.4?'▒':'░'}</b>`;continue}
        if(Math.abs(d-13)<1.1||Math.abs(d-6.5)<1.1)html+='·';
        else if(!dy)html+='─';
        else if(!dx)html+='│';
        else html+=' ';
      }
      html+='\n';
    }
    rad.innerHTML=html;
  }
  const sig=()=>[sel,Math.floor(S.dv),S.queue.length,offers.length,S.queue.length?Math.ceil((S.queue[0].ready-Date.now())/1000):0].join();
  function info(){
    if(view!=='scan'||!inf)return;
    sigI=sig();inf.innerHTML='';
    const L=(t,c)=>{const d=h('div','l'+(c?' '+c:''),t);inf.append(d);return d};
    L(' N '+pad('Rareté',11)+pad('Coût',6)+'Délai','hd');
    L(' - '+pad('------',11)+pad('----',6)+'-----','dim');
    offers.forEach((o,k)=>{
      const d=h('div','l row'+(k===sel?' sel':''));
      const rr=h('span','',pad(RAR[o.r],11));rr.style.color=RC[o.r];
      d.append(document.createTextNode((k===sel?'>':' ')+(k+1)+' '),rr,document.createTextNode(pad('◆'+o.c,6)+o.s+' s'));
      inf.append(d);
    });
    L('');
    const o=offers[sel];
    if(!o)L('Aucun contact sélectionné.','dim');
    else if(o.r>MAXR)L('Avertissement : trop rare pour cette version.','err');
    else if(S.queue.length>=PAR)L('Avertissement : bras pleins.','err');
    else if(S.dv<o.c)L('Avertissement : DeliVrac insuffisant.','err');
    else L('Contact '+(sel+1)+' prêt à commander.','ok');
    if(S.queue.length)L('En route : '+Math.max(0,Math.ceil((S.queue[0].ready-Date.now())/1000))+' s','dim');
    if(coarse()){
      const mk=(items)=>{
        const bar=h('div','cmds');
        items.forEach(([t,c,dis])=>{const x=h('button','lkb'+(dis?' off':''),'['+t+']');x.onclick=()=>submit(c);bar.append(x)});
        inf.append(bar);
      };
      mk(offers.map((_,k)=>[String(k+1),String(k+1)]));                                   // ligne 1 : contacts
      mk([['rechercher','rechercher'],['commander','commander',!can(o)]]);                // ligne 2 : actions
      mk([['retour','retour']]);                                                          // ligne 3 : retour
    }
  }
  function execScan(w,rest,raw){
    if(/^\d+$/.test(w))return pick(+w-1);
    if(w==='select'||w==='sel')return pick(parseInt(rest[0])-1);
    if(w==='rechercher'){newOffers();t0=Date.now();info();return line('Nouveau scan lancé... '+offers.length+' contacts détectés.','ok')}
    if(w==='commander')return orderIt();
    if(w==='retour'){clearInterval(rt);view='menu';cls();setPrompt();echo('help');return help()}
    unknown(raw);
  }
  function pick(k){
    if(!offers[k])return line('Contact introuvable. Choisissez un numéro entre 1 et '+offers.length+'.','err');
    sel=k;info();line('Contact '+(k+1)+' sélectionné.','ok');
  }
  function orderIt(){
    const o=offers[sel];
    if(!o)return line('Aucun contact sélectionné. Tapez un numéro (1-'+offers.length+').','err');
    if(o.r>MAXR)return line('Erreur : ce contact est trop rare pour cette version de Delivry.','err');
    if(S.queue.length>=PAR)return line('Erreur : mes bras sont pleins.','err');
    if(S.dv<o.c)return line('Erreur : DeliVrac insuffisant.','err');
    S.dv-=o.c;S.queue.push({ready:Date.now()+o.s*1000,r:o.r});save();
    offers.splice(sel,1);sel=-1;Tab.dv();info();
    line(`Commande transmise. Arrivée dans ${o.s} s.`,'ok');
  }
  function refresh(){if(view==='scan'&&sig()!==sigI)info()}

  return {mount,stop,refresh};
})();

/* ---------- Plaque holographique : sort de Delivry, à plat au-dessus du sol ---------- */
const Holo=(()=>{
  const grp=new THREE.Group(); grp.visible=false;
  const pcv=document.createElement('canvas'); pcv.width=pcv.height=256;
  {
    const g=pcv.getContext('2d');
    g.fillStyle='rgba(20,160,220,.16)'; g.fillRect(0,0,256,256);
    g.strokeStyle='rgba(127,252,240,.35)'; g.lineWidth=2;
    for(let i=32;i<256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.moveTo(0,i);g.lineTo(256,i);g.stroke()}
    g.strokeStyle='#7ffcf0'; g.lineWidth=8; g.strokeRect(4,4,248,248);
    g.strokeStyle='#ff3df0'; g.lineWidth=10;
    [[0,0,1,1],[256,0,-1,1],[0,256,1,-1],[256,256,-1,-1]].forEach(([x,y,sx,sy])=>{
      g.beginPath();g.moveTo(x+sx*40,y+sy*5);g.lineTo(x+sx*5,y+sy*5);g.lineTo(x+sx*5,y+sy*40);g.stroke()});
  }
  const plate=new THREE.Mesh(new THREE.PlaneGeometry(1,1),
    new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(pcv),transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide}));
  plate.rotation.x=-Math.PI/2; plate.renderOrder=2;
  const hcv=document.createElement('canvas'); hcv.width=hcv.height=256;
  const etex=new THREE.CanvasTexture(hcv); etex.minFilter=THREE.LinearFilter; etex.generateMipmaps=false;
  const esp=new THREE.Sprite(new THREE.SpriteMaterial({map:etex,transparent:true,depthWrite:false,fog:false,opacity:.95}));
  esp.renderOrder=3; esp.visible=false;
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:radial([[0,'rgba(80,220,255,.4)'],[1,'rgba(80,220,255,0)']]),
    blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false}));
  halo.renderOrder=1;
  const bg=new THREE.BufferGeometry(), bp=new Float32Array(6);
  bg.setAttribute('position',new THREE.BufferAttribute(bp,3));
  const beam=new THREE.Line(bg,new THREE.LineBasicMaterial({color:0x7ffcf0,transparent:true,opacity:.8,fog:false,depthTest:false}));
  beam.frustumCulled=false; beam.renderOrder=4;
  grp.add(plate,halo,esp,beam);
  let want=0,hv=0,ratio=1,has=false;

  function update(dt,dh){                       // dh : hauteur de Delivry à l'écran
    hv=clamp(hv+(want?dt:-dt)/.9,0,1);
    if(hv<=0){grp.visible=false;return}
    const sc=env==='factory'?fscene:scene; if(grp.parent!==sc)sc.add(grp);
    grp.visible=true;
    const p=hv*hv*(3-2*hv), ph=innerWidth<PHONE, PS=dh*(ph?1.2:3.4);
    const fx=bot.x-(dh*.55+PS*.5+(ph?6:24)), fz=bot.z+dh*.1;
    const y0=lerp(2,40,e)+Math.sin(performance.now()/700)*2*e;
    const x=lerp(bot.x,fx,p), y=lerp(sprite.position.y,y0,p), z=lerp(bot.z,fz,p);
    plate.position.set(x,y,z); plate.scale.set(PS*p+.01,PS*p+.01,1); plate.material.opacity=p;
    const eh=Math.min(ratio*dh,PS*.95)*p;
    esp.visible=has; esp.position.set(x,y+eh/2+3,z); esp.scale.set(eh+.01,eh+.01,1);
    halo.position.set(x,y+2,z); halo.scale.set(PS*1.6*p+.01,PS*1.6*p+.01,1);
    bp[0]=bot.x;bp[1]=sprite.position.y;bp[2]=bot.z;bp[3]=x;bp[4]=y;bp[5]=z; bg.attributes.position.needsUpdate=true;
    beam.material.opacity=.5+.4*Math.sin(performance.now()/120);
  }
  function show(layers){                        // copie réduite du papier en cours
    const g=hcv.getContext('2d'); g.clearRect(0,0,256,256); g.imageSmoothingQuality='high';
    layers.forEach(l=>{if(l.v){g.globalAlpha=l.o;g.drawImage(l.c,0,0,256,256)}}); g.globalAlpha=1;
    etex.needsUpdate=true; has=true;
  }
  return {update,show,open(r){ratio=r;want=1;has=false},close(){want=0}};
})();

/* ---------- PaperEdit ---------- */
const DB=(()=>{
  let p=null;
  const open=()=>p||(p=new Promise((res,rej)=>{
    const r=indexedDB.open('wiyp-papers',1);
    r.onupgradeneeded=()=>{r.result.createObjectStore('meta',{keyPath:'id'});r.result.createObjectStore('doc',{keyPath:'id'})};
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  }));
  const rd=async(st,fn)=>{const d=await open();return new Promise((res,rej)=>{
    const t=d.transaction(st,'readonly'),q=fn(t.objectStore(st));t.oncomplete=()=>res(q.result);t.onerror=t.onabort=()=>rej(t.error)})};
  const wr=async fn=>{const d=await open();return new Promise((res,rej)=>{
    const t=d.transaction(['meta','doc'],'readwrite');fn(t.objectStore('meta'),t.objectStore('doc'));
    t.oncomplete=()=>res(true);t.onerror=t.onabort=()=>rej(t.error)})};
  return {all:()=>rd('meta',s=>s.getAll()),get:id=>rd('doc',s=>s.get(id)),
    put:(m,d)=>wr((a,b)=>{a.put(m);b.put(d)}),del:id=>wr((a,b)=>{a.delete(id);b.delete(id)})};
})();

const PE=(()=>{
  const CATS=[['consommable','Consommable',"usage unique · jusqu'à 1:1",1],['objet','Objet',"jusqu'à 10:1",1],
    ['creature','Créature','',0],['personnage','Personnage','',0],['environnement','Environnement','',0],['activite','Activité','',0]];
  const RATIOS={consommable:[1/10,1/8,1/6,1/4,1/3,1/2,1],objet:[1/4,1/2,1,2,3,4,6,8,10]};
  const resOf=r=>r<=1?256:r<=4?512:1024;                    // ≤ Delivry : 256 · jusqu'à 4:1 : 512 · au-delà : 1024
  const lab=r=>r<1?'1:'+Math.round(1/r):r+':1';
  const maxF=res=>Math.max(2,Math.min(48,Math.floor(6e6/(res*res))));
  const maxL=res=>res>=1024?3:res>=512?5:8;
  const IC={
    pen:'<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
    eraser:'<path d="M4 15l8-9 8 8-5 5H8z"/><path d="M9 11l6 6"/>',
    fill:'<path d="M5 11l7-7 7 7-7 7z"/><path d="M19 15c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z"/>',
    pick:'<path d="M14 4l6 6-3 1-7 7-4 1 1-4 7-7z"/>',
    line:'<path d="M5 19L19 5"/>',
    rect:'<rect x="5" y="6" width="14" height="12" rx="1"/>',
    ellipse:'<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    lasso:'<path d="M12 5c5 0 8 2 8 5s-3 5-8 5-8-2-8-5 3-5 8-5z" stroke-dasharray="3 2"/><path d="M8 15c-1 2 0 4 2 4"/>',
    pan:'<path d="M8 12V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 6-5 6s-4-2-5-4l-2-4a1.5 1.5 0 0 1 3-1z"/>'
  };
  const TOOLS=[['pen','Pinceau (B)'],['eraser','Gomme (E)'],['fill','Remplir (G)'],['pick','Pipette (I)'],['line','Ligne (L)'],
    ['rect','Rectangle (R)'],['ellipse','Ellipse (O)'],['lasso','Lasso (M)'],['pan','Main (H)']];
  const KEYS={b:'pen',e:'eraser',g:'fill',i:'pick',l:'line',r:'rect',o:'ellipse',m:'lasso',h:'pan'};
  const BRUSH=[['rd','Rond'],['sq','Carré'],['spray','Aérosol'],['dither','Tramé'],['soft','Doux']];
  const PAL=['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#ffffff',
    '#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'];

  let body=null,api=null,view='',gen=0,metas=[],E=null,dirty=false,ui={},ro=null,autoFit=true,sizeUpd=null;
  let mode='draw',dock='brush',tool='pen',color='#ffffff',alpha=1,size=8,brush='rd',zoom=1,onion=true,sym=false,fillS=false,recent=[];
  let playing=0,saved=0,sel=null,fl=null,clip=null,stroke=null,lasso=null,drag=null,panning=null,rq=0,pq=0,hs=0;
  const undoS=[],redoS=[], sb=document.createElement('canvas');
  const sbg=()=>sb.getContext('2d');
  const h=(t,c,x)=>{const n=document.createElement(t);if(c)n.className=c;if(x!=null)n.textContent=x;return n};
  const B=(t,fn,c,tt)=>{const b=h('button','pe-b'+(c?' '+c:''),t);b.onclick=fn;if(tt)b.title=tt;return b};
  const R=(mn,mx,v,fn)=>{const i=h('input');i.type='range';i.min=mn;i.max=mx;i.value=v;i.oninput=()=>fn(+i.value,i);return i};
  const F=(t,right,...c)=>{const f=h('div','pe-f'),s=h('span','',t);if(right)s.append(right);f.append(s,...c);return f};
  const chips=(items,cur,fn)=>{const r=h('div','pe-chips');items.forEach(([k,t])=>{const b=h('button','pe-chip'+(k===cur?' on':''),t);b.onclick=()=>fn(k);r.append(b)});return r};
  const tog=(t,get,set)=>{const b=h('button','pe-chip'+(get()?' on':''),t);b.onclick=()=>{set(!get());b.classList.toggle('on',!!get())};return b};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const mkCv=(w,hh)=>{const c=document.createElement('canvas');c.width=w;c.height=hh;return c};
  const rgb=hx=>[1,3,5].map(i=>parseInt(hx.slice(i,i+2),16));
  const loadImg=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=s});

  /* ---------- modèle : papier > animations > images > calques ---------- */
  const newLy=n=>({n,v:true,o:1,l:false,c:mkCv(E.res,E.res)});
  const newFr=names=>({ly:(names||['Calque 1']).map(n=>newLy(n)),li:0});
  const cloneLy=l=>{const c=mkCv(l.c.width,l.c.height);c.getContext('2d').drawImage(l.c,0,0);return{...l,c}};
  const cloneFr=f=>({ly:f.ly.map(cloneLy),li:f.li});
  const A=()=>E.anims[E.ai], FR=()=>A().frames[E.fi], LY=()=>FR().ly[FR().li];
  const total=()=>E.anims.reduce((n,a)=>n+a.frames.length,0);
  function flat(f){const c=mkCv(E.res,E.res),g=c.getContext('2d');f.ly.forEach(l=>{if(l.v){g.globalAlpha=l.o;g.drawImage(l.c,0,0)}});return c}
  const isEmpty=c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<d.length;i+=4)if(d[i])return false;return true};
  const resetUndo=()=>{undoS.length=0;redoS.length=0};

  /* ---------- écrans : chargement, galerie, catégorie, taille ---------- */
  function open(b,a){body=b;api=a;loading()}
  async function loading(){
    const g=++gen; view='load'; body.innerHTML='';
    const w=h('div','pe-load'); w.innerHTML='<b>PAPEREDIT</b><div class="pe-bar"><i></i></div><small></small>'; body.append(w);
    const bar=w.querySelector('i'), sm=w.querySelector('small');
    const steps=['Initialisation du module...','Lecture de vos créations...','Calibrage de la holo-plaque...'];
    const list=DB.all().catch(()=>[]);
    for(let i=0;i<3;i++){if(g!==gen)return;sm.textContent=steps[i];bar.style.width=((i+1)/3*100)+'%';await sleep(380)}
    const m=await list; if(g!==gen)return; metas=m; gallery();
  }
  function head(t,bl,bf){const d=h('div','pe-hd');d.append(B(bl,bf),h('b','',t));return d}
  function gallery(){
    view='gal'; Holo.close(); api.big(false); body.innerHTML='';
    body.append(head('MES CRÉATIONS','‹ ACCUEIL',api.home));
    const g=h('div','pe-grid');
    metas.slice().sort((a,b)=>b.updated-a.updated).forEach(m=>{
      const c=h('div','pe-card'),im=new Image(); im.src=m.thumb;
      const x=h('button','x','✕'); x.onclick=ev=>{ev.stopPropagation();api.ask(`Supprimer « ${m.name} » ?`,async()=>{await DB.del(m.id);metas=metas.filter(z=>z.id!==m.id);gallery()})};
      c.append(im,h('b','',m.name),h('small','',`${m.cat} · ${m.res}px`),x); c.onclick=()=>openDoc(m.id); g.append(c);
    });
    const n=h('button','pe-card new'); n.append(h('span','','＋'),document.createTextNode('CRÉER UN PAPIER')); n.onclick=catScreen; g.append(n);
    body.append(g);
  }
  function catScreen(){
    view='cat'; body.innerHTML=''; body.append(head('CATÉGORIE','‹ RETOUR',gallery));
    const g=h('div','pe-cats');
    CATS.forEach(([k,n,d,on])=>{
      const b=h('button','pe-cat'+(on?'':' dis')); b.append(h('b','',n),h('small','',on?d:'indisponible'));
      if(on)b.onclick=()=>sizeScreen(k); else b.disabled=true; g.append(b);
    });
    body.append(g,h('div','pe-note','Seuls consommable et objet sont disponibles pour le moment.'));
  }
  function sizeScreen(cat){
    view='size'; body.innerHTML=''; const Rr=RATIOS[cat]; let i=cat==='objet'?2:Rr.length-1;
    const hd=head('TAILLE · '+cat.toUpperCase(),'‹ RETOUR',catScreen);
    const ok=B('VALIDER ›',()=>{sizeUpd=null;create(cat,Rr[i])},'ok'); ok.style.marginLeft='auto'; hd.append(ok);   // toujours visible
    const sc=h('div','pe-scr'),box=h('div','pe-pvw'),c=h('canvas'); box.append(c);
    const rg=h('input'); rg.type='range'; rg.min=0; rg.max=Rr.length-1; rg.step=1; rg.value=i;
    const tk=h('div','pe-ticks'); Rr.forEach((r,k)=>{const s=h('span','',lab(r));s.onclick=()=>{i=k;rg.value=k;upd()};tk.append(s)});
    const info=h('div','pe-info');
    function upd(){
      const r=Rr[i],rs=resOf(r); drawSize(c,r);
      [...tk.children].forEach((s,k)=>s.classList.toggle('on',k===i));
      info.textContent=`Taille ${lab(r)} par rapport à Delivry · résolution ${rs}×${rs} · ${maxF(rs)} images et ${maxL(rs)} calques max`;
    }
    rg.oninput=()=>{i=+rg.value;upd()};
    sc.append(box,rg,tk,info); body.append(hd,sc); sizeUpd=upd; requestAnimationFrame(upd);
  }
  addEventListener('resize',()=>{if(view==='size'&&sizeUpd)sizeUpd()});
  function drawSize(c,r){
    const W=c.width=c.clientWidth||300, H=c.height=c.clientHeight||160, g=c.getContext('2d');
    const pad=26,av=H-pad*2,u=av/Math.max(r,1),gy=H-pad;
    const img=sprite.material.map&&sprite.material.map.image, ar=img&&img.width?img.width/img.height:.8, dw=u*ar, x0=W*.22;
    g.strokeStyle='rgba(127,252,240,.4)'; g.beginPath(); g.moveTo(8,gy); g.lineTo(W-8,gy); g.stroke();
    const t=mkCv(Math.max(1,Math.round(dw)),Math.max(1,Math.round(u))), tg=t.getContext('2d');
    if(img&&img.width)tg.drawImage(img,0,0,t.width,t.height); else tg.fillRect(0,0,t.width,t.height);
    tg.globalCompositeOperation='source-in'; tg.fillStyle='#7ffcf0'; tg.fillRect(0,0,t.width,t.height);
    g.globalAlpha=.85; g.drawImage(t,x0-dw/2,gy-u); g.globalAlpha=1;
    const s=u*r,x1=W*.5;
    g.setLineDash([6,4]); g.strokeStyle='#ff3df0'; g.lineWidth=2; g.fillStyle='rgba(255,61,240,.12)'; g.fillRect(x1,gy-s,s,s); g.strokeRect(x1,gy-s,s,s); g.setLineDash([]);
    g.fillStyle='#d8fff3'; g.font='12px monospace'; g.fillText('Delivry',x0-24,gy+16); g.fillText('papier '+lab(r),x1,gy+16);
  }
  function create(cat,ratio){
    const res=resOf(ratio); E={id:null,name:'',cat,ratio,res,anims:[{name:'repos',fps:6,loop:true,frames:[]}],ai:0,fi:0};
    E.anims[0].frames.push(newFr()); dirty=false; editor();
  }
  async function openDoc(id){
    body.innerHTML=''; body.append(h('div','pe-note','Ouverture...'));
    const d=await DB.get(id); if(!d)return gallery();
    const anims=[];
    for(const a of d.anims){
      const fr=[];
      for(const f of a.frames){
        const ly=[];
        for(const l of f.ly){const c=mkCv(d.res,d.res),im=await loadImg(l.img);if(im)c.getContext('2d').drawImage(im,0,0);ly.push({n:l.n,v:l.v,o:l.o,l:l.l,c})}
        fr.push({ly,li:Math.min(f.li,ly.length-1)});
      }
      anims.push({name:a.name,fps:a.fps,loop:a.loop,frames:fr});
    }
    E={id:d.id,name:d.name,cat:d.cat,ratio:d.ratio,res:d.res,anims,ai:0,fi:0}; dirty=false; editor();
  }

  /* ---------- atelier ---------- */
  function editor(){
    view='edit'; mode='draw'; dock='brush'; tool='pen'; sel=fl=stroke=lasso=null; playing=0; autoFit=true; resetUndo();
    api.big(true); Holo.open(E.ratio); body.innerHTML=''; ui={};
    const root=h('div','pe-ed');
    const hd=h('div','pe-hd2'); ui.name=h('input'); ui.name.placeholder='Nom du papier'; ui.name.maxLength=24; ui.name.value=E.name;
    ui.name.oninput=()=>{E.name=ui.name.value;dirty=true};
    ui.tabs=h('div','pe-seg'); hd.append(ui.name,ui.tabs,B('QUITTER',quit,'bad'),B('ENREGISTRER',save,'ok'));
    ui.rail=h('div','pe-rail');
    const cvA=h('div','pe-cv'); ui.wrap=h('div','pe-wrap'); ui.stage=h('div','pe-stage'); ui.cv=h('canvas'); ui.pv=h('canvas','pv');
    ui.cv.width=ui.cv.height=ui.pv.width=ui.pv.height=sb.width=sb.height=E.res;
    ui.stage.append(ui.cv,ui.pv); ui.wrap.append(ui.stage);
    const bar=h('div','pe-fl');
    bar.append(B('↶',()=>swap(undoS,redoS),'t','Annuler (Ctrl+Z)'),B('↷',()=>swap(redoS,undoS),'t','Rétablir (Ctrl+Y)'),
      B('−',()=>setZoom(zoom/1.4,1),'t','Zoom −'),B('＋',()=>setZoom(zoom*1.4,1),'t','Zoom +'),B('⤢',fit,'t','Ajuster à la zone'));
    ui.st=h('div','pe-st'); cvA.append(ui.wrap,bar,ui.st);
    ui.dock=h('div','pe-dock'); ui.dt=h('div','pe-dt'); ui.db=h('div','pe-db'); ui.dock.append(ui.dt,ui.db);
    ui.tlb=h('div','pe-tlb');
    root.append(hd,ui.rail,cvA,ui.dock,ui.tlb); body.append(root);
    ui.pv.addEventListener('pointerdown',down); ui.pv.addEventListener('pointermove',move);
    ui.pv.addEventListener('pointerup',up); ui.pv.addEventListener('pointercancel',up);
    if(ro)ro.disconnect(); ro=new ResizeObserver(()=>{if(autoFit&&view==='edit'&&ui.wrap.isConnected)fit()}); ro.observe(ui.wrap);
    renderTabs(); renderRail(); renderPanel(); setZoom(.5);
    requestAnimationFrame(()=>{fit();paint()});
  }
  function renderTabs(){
    ui.tabs.innerHTML='';
    [['draw','DESSIN'],['anim','ANIMATION'],['prog','PROGRAMMATION']].forEach(([k,t])=>{
      const b=h('button',mode===k?'on':'',t);
      if(k==='prog'){b.disabled=true;b.title='Désactivé pour le moment'}else b.onclick=()=>setMode(k);
      ui.tabs.append(b);
    });
  }
  function setMode(k){
    stopPlay(); if(fl)applyFl(); mode=k; dock=k==='anim'?'anim':(dock==='anim'?'brush':dock);
    renderTabs(); renderPanel(); paint();
  }
  function renderRail(){
    ui.rail.innerHTML='';
    TOOLS.forEach(([k,t],i)=>{
      if(i===4||i===7)ui.rail.append(h('div','pe-sep'));
      const b=h('button','pe-tool'+(tool===k?' on':'')); b.dataset.k=k; b.title=t;
      b.innerHTML=`<svg viewBox="0 0 24 24">${IC[k]}</svg>`; b.onclick=()=>setTool(k); ui.rail.append(b);
    });
  }
  function setTool(k){
    if(k!=='lasso'&&fl)applyFl(); tool=k;
    ui.rail.querySelectorAll('.pe-tool').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
    ui.pv.style.cursor=k==='pan'?'grab':'crosshair'; renderDock(); paintPv();
  }
  function renderPanel(){renderDock();renderTLB()}
  function renderDock(){
    const tabs=mode==='anim'?[['anim','ANIM'],['brush','OUTIL'],['color','COUL.'],['layers','CALQ.']]:[['brush','OUTIL'],['color','COULEUR'],['layers','CALQUES']];
    ui.dt.innerHTML=''; tabs.forEach(([k,t])=>{const b=h('button',dock===k?'on':'',t);b.onclick=()=>{dock=k;renderDock()};ui.dt.append(b)});
    ui.db.innerHTML=''; ({anim:dAnim,brush:dBrush,color:dColor,layers:dLayers})[dock](ui.db);
  }

  /* ----- zoom et état ----- */
  function setZoom(z,user){
    if(user)autoFit=false;
    zoom=clamp(z,.05,8); const w=Math.round(E.res*zoom)+'px';
    [ui.stage,ui.cv,ui.pv].forEach(n=>{n.style.width=w;n.style.height=w});
    ui.cv.style.imageRendering=ui.pv.style.imageRendering=zoom>=2?'pixelated':'auto'; stat();
  }
  function fit(){autoFit=true;const w=ui.wrap.clientWidth-12,hh=ui.wrap.clientHeight-12;if(w>20&&hh>20)setZoom(Math.min(w,hh)/E.res)}
  function stat(m){
    if(!ui.st||!ui.st.isConnected||!E)return;
    ui.st.textContent=`${E.res}×${E.res} px · ${Math.round(zoom*100)}%`+(m?' · '+m:'')+` · ${A().name} ${E.fi+1}/${A().frames.length}`;
  }

  /* ----- rendu ----- */
  const qPaint=()=>{if(rq)return;rq=requestAnimationFrame(()=>{rq=0;if(ui.cv&&ui.cv.isConnected)paint()})};
  const qPv=()=>{if(pq)return;pq=requestAnimationFrame(()=>{pq=0;if(ui.pv&&ui.pv.isConnected)paintPv()})};
  const qHolo=()=>{if(hs)return;hs=setTimeout(()=>{hs=0;if(E&&view==='edit')Holo.show(FR().ly)},80)};
  function paint(){
    const g=ui.cv.getContext('2d'); g.clearRect(0,0,E.res,E.res); const a=A();
    const ghost=(f,k)=>f.ly.forEach(l=>{if(l.v){g.globalAlpha=l.o*k;g.drawImage(l.c,0,0)}});
    if(onion&&!playing){if(E.fi>0)ghost(a.frames[E.fi-1],.28);if(E.fi<a.frames.length-1)ghost(a.frames[E.fi+1],.2)}
    FR().ly.forEach(l=>{if(l.v){g.globalAlpha=l.o;g.drawImage(l.c,0,0)}}); g.globalAlpha=1;
    paintPv(); qHolo(); stat();
  }
  function outline(g,pts,close){
    g.beginPath(); pts.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y)); if(close)g.closePath();
    g.lineWidth=3/zoom; g.setLineDash([]); g.strokeStyle='#000'; g.stroke();
    g.lineWidth=1.5/zoom; g.setLineDash([6/zoom,4/zoom]); g.strokeStyle='#fff'; g.stroke(); g.setLineDash([]);
  }
  const flBox=()=>{
    const r=fl.r*Math.PI/180,c=Math.cos(r),s=Math.sin(r),w=fl.c.width/2*fl.s*fl.fx,hh=fl.c.height/2*fl.s;
    return[[-w,-hh],[w,-hh],[w,hh],[-w,hh]].map(([x,y])=>({x:fl.cx+x*c-y*s,y:fl.cy+x*s+y*c}));
  };
  function drawFl(g){g.save();g.translate(fl.cx,fl.cy);g.rotate(fl.r*Math.PI/180);g.scale(fl.s*fl.fx,fl.s);g.drawImage(fl.c,-fl.c.width/2,-fl.c.height/2);g.restore()}
  function paintPv(){
    const g=ui.pv.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,E.res,E.res);
    if(stroke){g.save();clipSel(g);g.globalAlpha=stroke.erase?.5:alpha;g.drawImage(sb,0,0);g.restore()}
    if(fl){drawFl(g);outline(g,flBox(),true)}
    const path=lasso||sel; if(path&&!fl)outline(g,path,!lasso);
  }
  function clipSel(g){if(sel){g.beginPath();sel.forEach((q,i)=>i?g.lineTo(q.x,q.y):g.moveTo(q.x,q.y));g.closePath();g.clip()}}
  function afterEdit(){dirty=true;qPaint();renderTL()}

  /* ----- pinceaux : tracé en couleur pleine sur un tampon, appliqué ensuite avec l'opacité ----- */
  function dab(g,x,y){
    const n=size,col=stroke&&stroke.erase?'#000000':color; g.fillStyle=col;
    const put=X=>{
      if(brush==='sq')g.fillRect(X-n/2,y-n/2,n,n);
      else if(brush==='rd'){g.beginPath();g.arc(X,y,n/2,0,6.2832);g.fill()}
      else if(brush==='spray'){const c=Math.max(3,Math.round(n*1.2));for(let k=0;k<c;k++){const a=Math.random()*6.2832,d=Math.sqrt(Math.random())*n;g.fillRect(X+Math.cos(a)*d,y+Math.sin(a)*d,1.5,1.5)}}
      else if(brush==='dither'){
        const c=Math.max(2,Math.round(n/8)),r2=n/2;
        for(let j=-r2;j<=r2;j+=c)for(let i=-r2;i<=r2;i+=c){const wx=Math.floor((X+i)/c),wy=Math.floor((y+j)/c);if(((wx+wy)&1)===0&&i*i+j*j<=r2*r2)g.fillRect(wx*c,wy*c,c,c)}
      }else{
        const r=Math.max(2,n*.75),[Rr,G,Bb]=rgb(col),gr=g.createRadialGradient(X,y,0,X,y,r);
        gr.addColorStop(0,`rgba(${Rr},${G},${Bb},.55)`);gr.addColorStop(1,`rgba(${Rr},${G},${Bb},0)`);g.fillStyle=gr;g.fillRect(X-r,y-r,r*2,r*2);
      }
    };
    put(x); if(sym)put(E.res-x);
  }
  function seg(a,b){
    const d=Math.hypot(b.x-a.x,b.y-a.y),st=Math.max(1,size/4),n=Math.ceil(d/st);
    for(let i=1;i<=n;i++){const t=i/n;dab(sbg(),a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t)}
  }
  function poly(pts){dab(sbg(),pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)seg(pts[i-1],pts[i])}
  function shapeTo(a,b){
    const g=sbg(); g.fillStyle=stroke.erase?'#000000':color;
    if(tool==='line')return poly([a,b]);
    const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),y0=Math.min(a.y,b.y),y1=Math.max(a.y,b.y);
    if(tool==='rect'){
      if(fillS)g.fillRect(x0,y0,x1-x0,y1-y0);
      else poly([{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1},{x:x0,y:y0}]);
    }else{
      const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2;
      if(fillS){g.beginPath();g.ellipse(cx,cy,Math.max(.5,rx),Math.max(.5,ry),0,0,6.2832);g.fill()}
      else{const n=Math.max(32,Math.ceil(Math.max(rx,ry)/2)),pts=[];for(let i=0;i<=n;i++){const t=i/n*6.2832;pts.push({x:cx+rx*Math.cos(t),y:cy+ry*Math.sin(t)})}poly(pts)}
    }
  }
  function flood(p){
    const W=E.res,l=LY(),u=l.c.getContext('2d').getImageData(0,0,W,W).data;
    const x=clamp(Math.floor(p.x),0,W-1),y=clamp(Math.floor(p.y),0,W-1),k0=(y*W+x)*4,t0=u[k0],t1=u[k0+1],t2=u[k0+2],t3=u[k0+3];
    const same=i=>{const k=i*4;return Math.abs(u[k]-t0)+Math.abs(u[k+1]-t1)+Math.abs(u[k+2]-t2)+Math.abs(u[k+3]-t3)<=48};
    const m=new ImageData(W,W),M=new Uint32Array(m.data.buffer),[r,g,b]=rgb(color),pc=((255<<24)|(b<<16)|(g<<8)|r)>>>0;
    const st=new Int32Array(W*W);let sp=0;st[sp++]=y*W+x;M[y*W+x]=pc;
    while(sp){
      const i=st[--sp],X=i%W;
      if(X>0&&!M[i-1]&&same(i-1)){M[i-1]=pc;st[sp++]=i-1}
      if(X<W-1&&!M[i+1]&&same(i+1)){M[i+1]=pc;st[sp++]=i+1}
      if(i>=W&&!M[i-W]&&same(i-W)){M[i-W]=pc;st[sp++]=i-W}
      if(i<W*W-W&&!M[i+W]&&same(i+W)){M[i+W]=pc;st[sp++]=i+W}
    }
    sbg().putImageData(m,0,0);
  }
  function commit(erase){
    const g=LY().c.getContext('2d'); snap();
    g.save(); clipSel(g); g.globalAlpha=alpha; g.globalCompositeOperation=erase?'destination-out':'source-over'; g.drawImage(sb,0,0); g.restore();
    if(!erase)recent=[color,...recent.filter(c=>c!==color)].slice(0,8);
    sbg().clearRect(0,0,sb.width,sb.height); stroke=null; afterEdit();
  }

  /* ----- annuler / rétablir ----- */
  function snap(){
    const l=LY(),c=l.c; undoS.push({l,d:c.getContext('2d').getImageData(0,0,c.width,c.height)});
    const mx=E.res>=1024?5:E.res>=512?10:25; while(undoS.length>mx)undoS.shift(); redoS.length=0; dirty=true;
  }
  function swap(from,to){
    if(fl&&!fl.cut){fl=null;paintPv();renderDock();return}
    fl=null; const e2=from.pop(); if(!e2)return;
    const g=e2.l.c.getContext('2d'); to.push({l:e2.l,d:g.getImageData(0,0,e2.l.c.width,e2.l.c.height)}); g.putImageData(e2.d,0,0); afterEdit();
  }

  /* ----- souris / doigt ----- */
  const pt=e=>{const r=ui.pv.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*E.res,y:(e.clientY-r.top)/r.height*E.res}};
  function down(e){
    if(playing)return api.toast('Arrête la lecture pour dessiner.');
    const p=pt(e); ui.pv.setPointerCapture(e.pointerId);
    if(tool==='pan'){panning={x:e.clientX,y:e.clientY,sl:ui.wrap.scrollLeft,st:ui.wrap.scrollTop};return}
    if(tool==='lasso'){if(fl){drag={ox:fl.cx-p.x,oy:fl.cy-p.y};return}lasso=[p];sel=null;paintPv();return}
    if(fl)applyFl();
    if(tool==='pick'){
      const x=clamp(Math.floor(p.x),0,E.res-1),y=clamp(Math.floor(p.y),0,E.res-1),d=flat(FR()).getContext('2d').getImageData(x,y,1,1).data;
      if(d[3]){color='#'+[d[0],d[1],d[2]].map(v=>v.toString(16).padStart(2,'0')).join('');alpha=d[3]/255;renderDock()}
      return;
    }
    const l=LY(); if(!l.v||l.l)return api.toast('Calque masqué ou verrouillé.');
    sbg().clearRect(0,0,sb.width,sb.height); stroke={a:p,last:p,erase:tool==='eraser'};
    if(tool==='fill'){flood(p);commit(false);return}
    if(tool==='pen'||tool==='eraser'){dab(sbg(),p.x,p.y);qPv()}
  }
  function move(e){
    if(panning){ui.wrap.scrollLeft=panning.sl-(e.clientX-panning.x);ui.wrap.scrollTop=panning.st-(e.clientY-panning.y);return}
    const p=pt(e); stat(Math.floor(p.x)+', '+Math.floor(p.y));
    if(drag){fl.cx=p.x+drag.ox;fl.cy=p.y+drag.oy;qPv();return}
    if(lasso){const q=lasso[lasso.length-1];if(Math.hypot(p.x-q.x,p.y-q.y)>2/zoom){lasso.push(p);qPv()}return}
    if(!stroke)return;
    if(tool==='pen'||tool==='eraser'){seg(stroke.last,p);stroke.last=p}
    else{sbg().clearRect(0,0,sb.width,sb.height);shapeTo(stroke.a,p)}
    qPv();
  }
  function up(e){
    if(panning){panning=null;return}
    if(drag){drag=null;return}
    if(lasso){if(lasso.length>=3)sel=lasso.slice();lasso=null;renderDock();paintPv();return}
    if(!stroke)return;
    if(tool!=='pen'&&tool!=='eraser'&&tool!=='fill'){sbg().clearRect(0,0,sb.width,sb.height);shapeTo(stroke.a,pt(e))}
    commit(stroke.erase);
  }
  addEventListener('keydown',ev=>{
    if(view!=='edit'||!E||ev.target.matches('input,textarea,select'))return;
    const k=ev.key.toLowerCase();
    if(ev.ctrlKey||ev.metaKey){
      if(k==='z'){ev.preventDefault();swap(undoS,redoS)}else if(k==='y'){ev.preventDefault();swap(redoS,undoS)}
      else if(k==='c'){ev.preventDefault();lift(false)}else if(k==='x'){ev.preventDefault();lift(true)}else if(k==='v'){ev.preventDefault();paste()}
      return;
    }
    if(KEYS[k])return setTool(KEYS[k]);
    if(k==='['||k===']'){size=clamp(size+(k===']'?2:-2),1,Math.round(E.res/2));return renderDock()}
    if(k==='enter'&&fl)return applyFl();
    if(k==='escape'){if(fl)applyFl();sel=null;renderDock();return paintPv()}
    if((k==='delete'||k==='backspace')&&sel&&!fl)delSel();
  });

  /* ----- lasso : sélection libre, déplacement, échelle, rotation ----- */
  function lift(cut){
    if(!sel)return api.toast('Trace d\'abord une sélection avec le lasso.');
    if(fl)applyFl(); const l=LY(); if(cut&&(l.l||!l.v))return api.toast('Calque masqué ou verrouillé.');
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; sel.forEach(q=>{x0=Math.min(x0,q.x);y0=Math.min(y0,q.y);x1=Math.max(x1,q.x);y1=Math.max(y1,q.y)});
    x0=Math.floor(clamp(x0,0,E.res));y0=Math.floor(clamp(y0,0,E.res));x1=Math.ceil(clamp(x1,0,E.res));y1=Math.ceil(clamp(y1,0,E.res));
    const w=Math.max(1,x1-x0),hh=Math.max(1,y1-y0),c=mkCv(w,hh),g=c.getContext('2d');
    g.save(); g.beginPath(); sel.forEach((q,i)=>i?g.lineTo(q.x-x0,q.y-y0):g.moveTo(q.x-x0,q.y-y0)); g.closePath(); g.clip(); g.drawImage(l.c,-x0,-y0); g.restore();
    if(cut){snap();const lg=l.c.getContext('2d');lg.save();clipSel(lg);lg.clearRect(0,0,E.res,E.res);lg.restore()}
    clip=mkCv(w,hh); clip.getContext('2d').drawImage(c,0,0);
    fl={c,cx:x0+w/2,cy:y0+hh/2,s:1,r:0,fx:1,cut}; afterEdit(); renderDock();
  }
  function paste(){
    if(!clip)return api.toast('Rien à coller.'); if(fl)applyFl();
    const c=mkCv(clip.width,clip.height); c.getContext('2d').drawImage(clip,0,0);
    fl={c,cx:E.res/2,cy:E.res/2,s:1,r:0,fx:1,cut:false}; setTool('lasso');
  }
  function applyFl(){
    if(!fl)return; const l=LY();
    if(l.v&&!l.l){snap();drawFl(l.c.getContext('2d'))}else api.toast('Calque masqué ou verrouillé : contenu non collé.');
    fl=null; sel=null; afterEdit(); if(ui.db)renderDock();
  }
  function delSel(){
    if(!sel)return; const l=LY(); if(!l.v||l.l)return api.toast('Calque masqué ou verrouillé.');
    snap(); const g=l.c.getContext('2d'); g.save(); clipSel(g); g.clearRect(0,0,E.res,E.res); g.restore(); afterEdit();
  }
  function clearLy(){
    if(fl)applyFl(); const l=LY(); if(l.l)return api.toast('Calque verrouillé.');
    snap(); const g=l.c.getContext('2d'); g.save(); clipSel(g); g.clearRect(0,0,E.res,E.res); g.restore(); afterEdit();
  }
  function flipLy(v){
    if(fl){fl.fx*=-1;return qPv()}
    const l=LY(); if(l.l)return api.toast('Calque verrouillé.');
    snap(); const t=mkCv(E.res,E.res); t.getContext('2d').drawImage(l.c,0,0);
    const g=l.c.getContext('2d'); g.clearRect(0,0,E.res,E.res); g.save();
    if(v){g.translate(0,E.res);g.scale(1,-1)}else{g.translate(E.res,0);g.scale(-1,1)} g.drawImage(t,0,0); g.restore(); afterEdit();
  }

  /* ---------- panneau : outil, couleur, calques ---------- */
  function dBrush(p){
    const sv=h('em','',size+' px'),ov=h('em','',Math.round(alpha*100)+'%');
    p.append(F('Pinceau',null,chips(BRUSH,brush,k=>{brush=k;renderDock()})));
    p.append(F('Taille',sv,R(1,Math.max(8,Math.round(E.res/4)),size,v=>{size=v;sv.textContent=v+' px'})));
    p.append(F('Opacité',ov,R(1,100,Math.round(alpha*100),v=>{alpha=v/100;ov.textContent=v+'%'})));
    const o=h('div','pe-chips'); o.append(tog('Symétrie',()=>sym,v=>sym=v),tog('Formes pleines',()=>fillS,v=>fillS=v),tog('Pelure',()=>onion,v=>{onion=v;paint()}));
    p.append(F('Options',null,o));
    const a=h('div','pe-chips'); a.append(B('Vider',clearLy),B('⇋ Miroir',()=>flipLy(0)),B('⇵ Miroir',()=>flipLy(1))); p.append(F('Calque actif',null,a));
    if(tool==='lasso'||sel||fl){
      const s=h('div','pe-chips'); s.append(B('Couper',()=>lift(true)),B('Copier',()=>lift(false)),B('Coller',paste),B('Effacer',delSel),
        B('Désélect.',()=>{if(fl)applyFl();sel=null;paintPv();renderDock()})); p.append(F('Sélection',null,s));
      if(fl){
        const sv2=h('em','',Math.round(fl.s*100)+'%'),rv=h('em','',Math.round(fl.r)+'°');
        p.append(F('Échelle',sv2,R(10,300,Math.round(fl.s*100),v=>{fl.s=v/100;sv2.textContent=v+'%';qPv()})),
          F('Rotation',rv,R(-180,180,Math.round(fl.r),v=>{fl.r=v;rv.textContent=v+'°';qPv()})));
        const t=h('div','pe-chips'); t.append(B('Miroir',()=>{fl.fx*=-1;qPv()}),B('Appliquer',applyFl,'ok')); p.append(t);
      }
    }
  }
  function dColor(p){
    const cur=h('div','pe-cur'),chk=h('span','pe-chk'),sw=h('i'); chk.append(sw);
    const ci=h('input'); ci.type='color'; ci.value=color;
    const hx=h('input'); hx.type='text'; hx.value=color; hx.maxLength=7; hx.spellcheck=false;
    const upd=()=>{sw.style.background=color;sw.style.opacity=alpha;ci.value=color;hx.value=color};
    ci.oninput=()=>{color=ci.value;upd()};
    hx.onchange=()=>{const v=hx.value.trim();if(/^#[0-9a-f]{6}$/i.test(v)){color=v.toLowerCase();renderDock()}else hx.value=color};
    cur.append(chk,ci,hx); upd(); p.append(F('Couleur active',null,cur));
    const ov=h('em','',Math.round(alpha*100)+'%');
    p.append(F('Opacité',ov,R(1,100,Math.round(alpha*100),v=>{alpha=v/100;ov.textContent=v+'%';upd()})));
    const sw8=(list)=>{const g=h('div','pe-pal');list.forEach(c=>{const b=h('button','pe-sw'+(c===color?' on':''));b.style.background=c;b.title=c;b.onclick=()=>{color=c;renderDock()};g.append(b)});return g};
    p.append(F('Palette',null,sw8(PAL)));
    if(recent.length)p.append(F('Récentes',null,sw8(recent)));
  }
  function lyDone(){resetUndo();renderDock();afterEdit()}
  function dLayers(p){
    const f=FR(),list=h('div','pe-ly');
    for(let i=f.ly.length-1;i>=0;i--){
      const l=f.ly[i],r=h('div','pe-l'+(i===f.li?' on':''));
      const ey=B(l.v?'👁':'·',null,'t'); ey.onclick=ev=>{ev.stopPropagation();l.v=!l.v;afterEdit();renderDock()};
      const nm=h('span','nm',l.n); nm.ondblclick=()=>{const n=prompt('Nom du calque',l.n);if(n){l.n=n.slice(0,16);renderDock()}};
      const lk=B(l.l?'🔒':'🔓',null,'t'); lk.onclick=ev=>{ev.stopPropagation();l.l=!l.l;renderDock()};
      const op=R(0,100,Math.round(l.o*100),v=>{l.o=v/100;qPaint();dirty=true}); op.onclick=ev=>ev.stopPropagation(); op.title='Opacité du calque';
      r.onclick=()=>{if(fl)applyFl();f.li=i;renderDock()}; r.append(ey,nm,lk,op); list.append(r);
    }
    p.append(list);
    const mx=maxL(E.res),r=h('div','pe-chips');
    r.append(B('＋',()=>{if(f.ly.length>=mx)return api.toast(`Maximum ${mx} calques à cette résolution.`);if(fl)applyFl();f.ly.splice(f.li+1,0,newLy('Calque '+(f.ly.length+1)));f.li++;lyDone()},'t','Nouveau'),
      B('⧉',()=>{if(f.ly.length>=mx)return api.toast(`Maximum ${mx} calques à cette résolution.`);if(fl)applyFl();const c=cloneLy(f.ly[f.li]);c.n=(c.n+' bis').slice(0,16);f.ly.splice(f.li+1,0,c);f.li++;lyDone()},'t','Dupliquer'),
      B('▲',()=>{if(f.li>=f.ly.length-1)return;if(fl)applyFl();[f.ly[f.li],f.ly[f.li+1]]=[f.ly[f.li+1],f.ly[f.li]];f.li++;lyDone()},'t','Monter'),
      B('▼',()=>{if(f.li<=0)return;if(fl)applyFl();[f.ly[f.li],f.ly[f.li-1]]=[f.ly[f.li-1],f.ly[f.li]];f.li--;lyDone()},'t','Descendre'),
      B('⤓',()=>{if(f.li<=0)return api.toast('Rien en dessous.');if(fl)applyFl();const top=f.ly[f.li],g=f.ly[f.li-1].c.getContext('2d');g.globalAlpha=top.o;g.drawImage(top.c,0,0);g.globalAlpha=1;f.ly.splice(f.li,1);f.li--;lyDone()},'t','Fusionner vers le bas'),
      B('✕',()=>{if(f.ly.length<2)return api.toast('Garde au moins un calque.');if(fl)applyFl();f.ly.splice(f.li,1);f.li=Math.max(0,f.li-1);lyDone()},'t','Supprimer'));
    p.append(r,h('div','pe-note',`${f.ly.length}/${mx} calques · double-clic sur un nom pour le renommer`));
  }

  /* ---------- animation ---------- */
  function dAnim(p){
    const list=h('div','pe-ly');
    E.anims.forEach((a,i)=>{
      const r=h('div','pe-l'+(i===E.ai?' on':'')); r.append(h('span','nm',a.name+(i?'':' ★')),h('em','',a.frames.length+' img'));
      r.onclick=()=>{stopPlay();if(fl)applyFl();E.ai=i;E.fi=0;resetUndo();renderPanel();paint()}; list.append(r);
    });
    p.append(F('Animations',null,list));
    const ac=h('div','pe-chips'); ac.append(B('＋ Nouvelle',addAnim),B('Renommer',renameAnim),B('Dupliquer',dupAnim),B('Supprimer',delAnim,'bad')); p.append(ac);
    const fv=h('em','',A().fps+' img/s'); p.append(F('Vitesse',fv,R(1,24,A().fps,v=>{A().fps=v;fv.textContent=v+' img/s';dirty=true})));
    const t=h('div','pe-chips'); t.append(tog('Boucle',()=>A().loop||E.ai===0,v=>{A().loop=v;dirty=true}),tog('Pelure d\'oignon',()=>onion,v=>{onion=v;paint()}));
    p.append(F('Options',null,t),h('div','pe-note',`Total : ${total()}/${maxF(E.res)} images`));
  }
  function renderTLB(){
    const t=ui.tlb; ui.tl=null; ui.fc=null; ui.play=null;
    if(mode!=='anim'){t.style.display='none';return}
    t.style.display=''; t.innerHTML='';
    const r=h('div','pe-tr'); ui.play=B(playing?'■':'▶',togglePlay,'ok t','Lire / arrêter'); ui.fc=h('span','');
    r.append(ui.play,B('＋',()=>addFrame(false),'t','Nouvelle image'),B('⧉',()=>addFrame(true),'t','Dupliquer l\'image'),B('✕',delFrame,'t','Supprimer l\'image'),
      B('←',()=>moveFrame(-1),'t','Déplacer vers la gauche'),B('→',()=>moveFrame(1),'t','Déplacer vers la droite'),ui.fc);
    ui.tl=h('div','pe-tl'); t.append(r,ui.tl); renderTL(); updCount();
  }
  const updCount=()=>{if(ui.fc&&ui.fc.isConnected)ui.fc.textContent=`image ${E.fi+1}/${A().frames.length} · total ${total()}/${maxF(E.res)}`};
  function renderTL(){
    const tl=ui.tl; if(!tl||!tl.isConnected)return; tl.innerHTML='';
    A().frames.forEach((f,i)=>{
      const b=h('button','pe-th'+(i===E.fi?' on':'')),c=mkCv(64,64),g=c.getContext('2d');
      f.ly.forEach(l=>{if(l.v){g.globalAlpha=l.o;g.drawImage(l.c,0,0,64,64)}});
      b.append(c,h('i','',String(i+1)));
      b.onclick=()=>{stopPlay();if(fl)applyFl();E.fi=i;resetUndo();renderTL();updCount();paint()};
      tl.append(b);
    });
  }
  function addFrame(dup){
    if(total()>=maxF(E.res))return api.toast(`Limite : ${maxF(E.res)} images à cette résolution.`);
    stopPlay(); if(fl)applyFl(); const a=A(),cur=FR();
    a.frames.splice(E.fi+1,0,dup?cloneFr(cur):newFr(cur.ly.map(l=>l.n))); E.fi++; resetUndo(); dirty=true; renderPanel(); paint();
  }
  function delFrame(){
    stopPlay(); const a=A();
    if(a.frames.length<2){a.frames[0].ly.forEach(l=>l.c.getContext('2d').clearRect(0,0,E.res,E.res));dirty=true;renderPanel();paint();return}
    a.frames.splice(E.fi,1); E.fi=Math.min(E.fi,a.frames.length-1); resetUndo(); dirty=true; renderPanel(); paint();
  }
  function moveFrame(d){
    const a=A(),j=E.fi+d; if(j<0||j>=a.frames.length)return;
    [a.frames[E.fi],a.frames[j]]=[a.frames[j],a.frames[E.fi]]; E.fi=j; dirty=true; renderTL(); updCount(); paint();
  }
  function addAnim(){
    if(total()>=maxF(E.res))return api.toast(`Limite : ${maxF(E.res)} images à cette résolution.`);
    let n=prompt('Nom de l\'animation (ex : clic, joie, marche)','clic'); if(!n)return;
    n=n.trim().slice(0,16); if(!n||E.anims.some(a=>a.name===n))return api.toast('Ce nom existe déjà.');
    stopPlay(); E.anims.push({name:n,fps:8,loop:false,frames:[newFr(FR().ly.map(l=>l.n))]}); E.ai=E.anims.length-1; E.fi=0; resetUndo(); dirty=true; renderPanel(); paint();
  }
  function dupAnim(){
    const a=A(); if(total()+a.frames.length>maxF(E.res))return api.toast(`Pas assez de place : il reste ${maxF(E.res)-total()} images.`);
    let n=(a.name+'2').slice(0,16),k=2; while(E.anims.some(x=>x.name===n))n=a.name.slice(0,14)+(++k);
    stopPlay(); E.anims.push({name:n,fps:a.fps,loop:false,frames:a.frames.map(cloneFr)}); E.ai=E.anims.length-1; E.fi=0; resetUndo(); dirty=true; renderPanel(); paint();
    api.toast(`Animation dupliquée : « ${n} ».`);
  }
  function renameAnim(){
    if(E.ai===0)return api.toast('L\'animation de repos ne peut pas être renommée.');
    let n=prompt('Nouveau nom',A().name); if(!n)return; n=n.trim().slice(0,16);
    if(!n||E.anims.some(x=>x!==A()&&x.name===n))return api.toast('Nom invalide ou déjà pris.'); A().name=n; dirty=true; renderPanel();
  }
  function delAnim(){
    if(E.ai===0)return api.toast('L\'animation de repos ne peut pas être supprimée.');
    api.ask('Supprimer cette animation ?',()=>{stopPlay();E.anims.splice(E.ai,1);E.ai=0;E.fi=0;resetUndo();dirty=true;renderPanel();paint()});
  }
  function togglePlay(){
    if(playing)return stopPlay(); if(fl)applyFl();
    playing=1; saved=E.fi; E.fi=0; if(ui.play)ui.play.textContent='■';
    (function f(){
      if(!playing)return; paint();
      setTimeout(()=>{if(!playing)return;E.fi=(E.fi+1)%A().frames.length;f()},1000/A().fps);
    })();
  }
  function stopPlay(){if(!playing)return;playing=0;E.fi=saved;if(ui.db&&ui.db.isConnected){renderPanel();paint()}}

  /* ---------- enregistrer, quitter ---------- */
  async function save(){
    if(fl)applyFl(); const name=E.name.trim();
    if(name.length<2)return api.toast('Donne un nom au papier (2 caractères minimum).');
    const f0=flat(E.anims[0].frames[0]); if(isEmpty(f0))return api.toast('Le papier est vide : dessine quelque chose.');
    E.id=E.id||'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    const doc={id:E.id,name,cat:E.cat,ratio:E.ratio,res:E.res,
      anims:E.anims.map(a=>({name:a.name,fps:a.fps,loop:a.loop,frames:a.frames.map(f=>({li:f.li,ly:f.ly.map(l=>({n:l.n,v:l.v,o:l.o,l:l.l,img:l.c.toDataURL()}))}))}))};
    const th=mkCv(128,128); th.getContext('2d').drawImage(f0,0,0,128,128);
    const meta={id:E.id,name,cat:E.cat,ratio:E.ratio,res:E.res,thumb:th.toDataURL(),updated:Date.now()};
    try{await DB.put(meta,doc);dirty=false;api.toast('Papier enregistré.')}catch(err){api.toast('Échec de l\'enregistrement (stockage plein ?).')}
  }
  function quit(){
    if(!dirty)return leave();
    api.ask('Quitter ? Les modifications non enregistrées seront perdues.',leave);
  }
  async function leave(){
    stopPlay(); if(ro){ro.disconnect();ro=null} E=null; view='';
    metas=await DB.all().catch(()=>[]); gallery();
  }
  function stop(){stopPlay();if(ro){ro.disconnect();ro=null}Holo.close();gen++;view='';E=null}

  return {open,stop};
})();

/* ---------- Tablette ---------- */
const Tab=(()=>{
  let el=null,tmo=0,shown=false,big=false,tt=0;
  const TPL=`<div class="tb-dev"><i class="rv a"></i><i class="rv b"></i><i class="rv c"></i><i class="rv d"></i>
    <div class="tb-bezel"><div class="tb-screen">
      <div class="tb-bar"><span class="led"></span><b class="tb-t">Windows PowerShell</b><span class="sp"></span><span class="tb-dv">◆ <span id="dv"></span></span><span class="wc"><i>─</i><i>□</i><i id="wx">✕</i></span></div>
      <div class="tb-main"></div>
    </div></div></div>`;
  const dvTxt=()=>{
    const d=document.getElementById('dv');if(d)d.textContent=Math.floor(S.dv);
    const c=document.getElementById('clk');
    if(c)c.textContent=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  };
  const IC={
    pe:'<svg viewBox="0 0 48 48"><path d="M12 5h17l9 9v29H12z"/><path d="M29 5v9h9"/><path d="M18 26h14M18 32h14M18 38h8"/></svg>',
    dd:'<svg viewBox="0 0 48 48"><path d="M24 6v5"/><circle cx="24" cy="4" r="2"/><rect x="9" y="11" width="30" height="22" rx="7"/><circle cx="18" cy="22" r="3"/><circle cx="30" cy="22" r="3"/><path d="M15 38h18v5H15z"/></svg>',
    cn:'<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><path d="M24 3v8M24 37v8M3 24h8M37 24h8"/><path d="M31 17l-5 9-9 5 5-9z"/></svg>',
    px:'<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="12"/><circle cx="24" cy="24" r="5"/></svg>'
  };
  const MODERN=`<div class="mt off">
    <div class="mt-st"><span class="led"></span><b class="t">DELIVRY PAD</b><span class="sp"></span><span id="clk"></span><span class="tb-dv">◆ <span id="dv"></span></span><span id="mx">✕</span></div>
    <div class="mt-body"></div>
    <div class="mt-toast"></div>
  </div>`;
  function toast(s){
    const t=el&&el.querySelector('.mt-toast'); if(!t)return;
    t.textContent=s; t.classList.add('on'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('on'),2000);
  }
  function ask(msg,yes){
    const mt=el&&el.querySelector('.mt'); if(!mt)return;
    const o=document.createElement('div'); o.className='pe-cf'; o.innerHTML='<div class="pe-cb"><p></p><div class="pe-row"></div></div>';
    o.querySelector('p').textContent=msg; const row=o.querySelector('.pe-row');
    const mk=(t,c,fn)=>{const b=document.createElement('button');b.className='pe-b '+c;b.textContent=t;b.onclick=()=>{o.remove();if(fn)fn()};row.append(b)};
    mk('ANNULER','',null); mk('CONFIRMER','bad',yes); mt.append(o);
  }
  function home(){                                  // écran d'accueil : les 4 applications
    const b=el&&el.querySelector('.mt-body'); if(!b)return;
    b.innerHTML=`<div class="mt-hi"><b>Espace contributeur</b><small>4 modules</small></div>
    <div class="mt-ap">
      <button class="app a1" data-n="PaperEdit"><i class="id">MOD-01</i><i class="st ok"></i>${IC.pe}<b>PaperEdit</b><small>EN LIGNE</small></button>
      <button class="app a2" data-n="DelivryDressing"><i class="id">MOD-02</i><i class="st"></i>${IC.dd}<b>DelivryDressing</b><small>HORS LIGNE</small></button>
      <button class="app a3" data-n="CreaNavigator"><i class="id">MOD-03</i><i class="st"></i>${IC.cn}<b>CreaNavigator</b><small>HORS LIGNE</small></button>
    </div>
    <button class="app wide a4" data-n="Environnement expérimental"><i class="st"></i>${IC.px}<span><b>Environnement expérimental</b><small>OUVRIR UN PORTAIL</small></span></button>
    <div class="mt-ft"><span class="led"></span>SESSION CONTRIBUTEUR · CLÉ VALIDE</div>`;
    b.querySelector('.a1').onclick=()=>PE.open(b,{home:goHome,toast,ask,big:v=>{big=v;place()}});
    b.querySelectorAll('.a2,.a3').forEach(x=>x.onclick=()=>toast(x.dataset.n+' : module hors ligne'));
    const wb=b.querySelector('.app.wide');
    if(env==='factory'){
      wb.dataset.n='Espace de base';
      wb.querySelector('b').textContent='Espace de base';
      wb.querySelector('small').textContent='RETOUR PAR LE PORTAIL';
    }
    wb.onclick=()=>Portal.start();
  }
  function goHome(){PE.stop();big=false;place();home()}
  /* La tablette se retourne vers le haut ; l'écran moderne est éteint, puis s'allume une fois la rotation finie */
  function flip(){
    const d=el;if(!d)return;
    const dev=d.querySelector('.tb-dev'),T='perspective(1200px) rotateX(';
    dev.animate([{transform:T+'0deg)'},{transform:T+'90deg)'}],{duration:480,easing:'ease-in',fill:'forwards'}).finished
    .then(()=>{
      if(el!==d)return;
      dev.classList.add('modern');
      dev.querySelector('.tb-bezel').innerHTML=MODERN;
      dev.querySelector('#mx').onclick=close;
      home(); dvTxt();
      return dev.animate([{transform:T+'-90deg)'},{transform:T+'0deg)'}],{duration:480,easing:'ease-out',fill:'forwards'}).finished;
    }).then(()=>{
      if(el!==d)return;
      dev.getAnimations().forEach(a=>a.cancel());
      setTimeout(()=>{const mt=dev.querySelector('.mt');if(el===d&&mt){mt.classList.remove('off');mt.classList.add('on')}},250);
    });
  }
  function place(){
    if(!el) return;
    const vw=innerWidth, vh=innerHeight;
    let W,H,L,T;
    if(vw<PHONE){
      if(big){T=Math.round(vh*.2+62);L=6;W=vw-12;H=vh-T-6}
      else{T=Math.round(vh*.2+95);L=10;W=vw-20;H=Math.max(260,vh-T-64)}
      el.classList.add('ph');
    }else if(big){
      W=clamp(vw/2-74,340,980);H=vh-30;L=vw/2+64;T=15;el.classList.remove('ph');
    }else{
      W=clamp(vw/2-100,340,640);H=Math.min(460,vh-90);L=vw/2+80;T=clamp(vh/2-H/2-10,12,vh-H-24);
      el.classList.remove('ph');
    }
    el.classList.toggle('flat',big);
    Object.assign(el.style,{left:L+'px',top:T+'px',width:W+'px',height:H+'px'});
  }
  function open(){
    if(el) return;
    shown=true;
    bot.copy(target); homing=false; clearTimeout(homeTimer);
    el=document.createElement('div'); el.id='tb'; el.innerHTML=TPL;
    document.body.appendChild(el); place(); dvTxt();
    Term.mount(el.querySelector('.tb-main'));
    el.querySelector('#wx').onclick=close;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(!el) return;
      el.classList.add('in'); tmo=setTimeout(()=>el&&el.classList.add('on'),450);
    }));
  }
  function close(){
    clearTimeout(tmo); if(!el) return; Term.stop(); PE.stop(); big=false;
    const d=el; el=null;
    d.classList.remove('on');                                   // écran CRT : s'éteint
    const mt=d.querySelector('.mt');if(mt){mt.classList.remove('on','off');mt.classList.add('down')}   // écran moderne : s'éteint
    setTimeout(()=>d.classList.remove('in'),650);               // la tablette repart ensuite
    setTimeout(()=>{d.remove();if(!el)shown=false},1450);
  }
  addEventListener('resize',place);
  addEventListener('keydown',ev=>{if(ev.key==='Escape') close()});
  return {open,close,flip,dv:dvTxt,toggle(){el?close():open()},get on(){return !!el},get shown(){return shown}};
})();

/* ---------- Portail : verrouillage, étincelles, ouverture, expansion ---------- */
function botScreen(){                         // position et rayon de Delivry à l'écran
  _v.copy(sprite.position).project(camera);
  const x=(_v.x+1)/2*innerWidth, y=(1-_v.y)/2*innerHeight;
  _u.setFromMatrixColumn(camera.matrixWorld,1).multiplyScalar(sprite.scale.y/2).add(sprite.position).project(camera);
  return {x,y,r:Math.max(40,Math.hypot((_u.x-_v.x)/2*innerWidth,(_u.y-_v.y)/2*innerHeight))};
}
const Portal=(()=>{
  const lockEl=document.createElement('div');
  lockEl.style.cssText='position:fixed;inset:0;z-index:90;display:none;cursor:wait';
  const fx=document.createElement('canvas');
  fx.style.cssText='position:fixed;inset:0;z-index:80;pointer-events:none';
  document.body.append(lockEl,fx);
  const g=fx.getContext('2d');
  const T1=.8, T2=1.7, T3=2.2, T4=4.0;       // fin des étincelles · fin de l'ouverture · fin du palier · fin de l'expansion
  const COLS=['#fff3b0','#ffb347','#ff7a1a','#9ff0ff'];
  let parts=[], t0=0, last=0, run=false, fin=false, flash=0, acc=0, to='factory';
  const fit=()=>{fx.width=innerWidth;fx.height=innerHeight};
  addEventListener('resize',fit);

  function ctr(){                              // le portail s'ouvre à côté de Delivry
    const b=botScreen(), s=b.x>innerWidth*.62?-1:1;
    return {x:b.x+s*b.r*2.1,y:b.y-b.r*.15,r:Math.max(60,b.r*1.5)};
  }
  function spawn(c,onRing){
    const a=Math.random()*6.2832;
    if(onRing&&P){
      const sp=80+Math.random()*220;
      parts.push({x:c.x+Math.cos(a)*P.r,y:c.y+Math.sin(a)*P.r,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-60,l:0,m:.3+Math.random()*.6,c:COLS[Math.random()*4|0]});
    }else{
      const sp=140+Math.random()*320;
      parts.push({x:c.x,y:c.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-120,l:0,m:.35+Math.random()*.7,c:COLS[Math.random()*3|0]});
    }
  }
  function bolt(c,r){
    let a=Math.random()*6.2832,x=c.x+Math.cos(a)*r,y=c.y+Math.sin(a)*r;
    g.beginPath();g.moveTo(x,y);
    for(let i=0;i<5;i++){a+=(Math.random()-.5)*1.2;const l=10+Math.random()*22;x+=Math.cos(a)*l;y+=Math.sin(a)*l;g.lineTo(x,y)}
    g.stroke();
  }
  function end(){
    run=false;locked=false;lockEl.style.display='none';g.clearRect(0,0,fx.width,fx.height);parts=[];
  }
  function tick(now){
    if(!run)return;
    const dt=Math.min(.05,(now-last)/1000);last=now;
    const ts=(now-t0)/1000;
    g.clearRect(0,0,fx.width,fx.height);

    if(!fin){
      const c=ctr();
      const Rmax=Math.max(Math.hypot(c.x,c.y),Math.hypot(innerWidth-c.x,c.y),Math.hypot(c.x,innerHeight-c.y),Math.hypot(innerWidth-c.x,innerHeight-c.y))*1.12+40;
      let r=0,k=0;
      if(ts>=T1&&ts<T2){k=(ts-T1)/(T2-T1);r=c.r*(1-Math.pow(1-k,3))}
      else if(ts>=T2&&ts<T3)r=c.r*(1+.05*Math.sin(4*Math.PI*(ts-T2)));
      else if(ts>=T3){k=Math.min(1,(ts-T3)/(T4-T3));r=c.r+(Rmax-c.r)*Math.pow(k,2.6)}
      P=r>.5?{x:c.x,y:c.y,r}:null;

      /* étincelles : de plus en plus nombreuses, puis sur le contour du portail */
      if(ts>=0){
        const rate=ts<T1?30+ts*140:ts<T3?110:110+260*k;
        acc+=rate*dt;while(acc>=1){acc--;spawn(c,ts>=T1&&!!P)}
      }
      if(parts.length>600)parts.splice(0,parts.length-600);

      /* tremblement de l'écran */
      const amp=ts<T1?0:ts<T3?2.5:2.5+13*k*k;
      cv.style.transform=amp>.1?`translate(${(Math.random()-.5)*amp*2}px,${(Math.random()-.5)*amp*2}px) scale(1.04)`:'';

      /* éclairs autour du portail */
      if(P){
        g.save();g.globalCompositeOperation='lighter';g.strokeStyle='rgba(160,240,255,.9)';g.lineWidth=1.5;g.shadowColor='#7ffcf0';g.shadowBlur=10;
        for(let i=0;i<3;i++)bolt(c,P.r*(1+.02*Math.sin(ts*9+i)));
        g.restore();
      }
      if(ts>=T3){g.fillStyle=`rgba(255,240,220,${.55*Math.pow(k,6)})`;g.fillRect(0,0,fx.width,fx.height)}
      if(ts>=T4){fin=true;env=to;P=null;cv.style.transform='';flash=1;parts.length=0}
    }else{
      flash-=dt*1.8;
      g.fillStyle=`rgba(255,240,220,${Math.max(0,flash)})`;g.fillRect(0,0,fx.width,fx.height);
      if(flash<=0)return end();
    }

    /* dessin des étincelles */
    g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
    parts=parts.filter(p=>(p.l+=dt)<p.m);
    parts.forEach(p=>{
      p.vy+=700*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
      g.strokeStyle=p.c;g.globalAlpha=1-p.l/p.m;g.lineWidth=1+2*(1-p.l/p.m);
      g.beginPath();g.moveTo(p.x-p.vx*.03,p.y-p.vy*.03);g.lineTo(p.x,p.y);g.stroke();
    });
    g.restore();
    requestAnimationFrame(tick);
  }
  function start(){
    if(run)return;
    to=env==='factory'?'base':'factory';
    run=true;fin=false;locked=true;flash=0;acc=0;parts=[];P=null;
    lockEl.style.display='block';fit();
    bot.copy(target);homing=false;clearTimeout(homeTimer);   // Delivry est au centre de la vue
    Tab.close();
    const now=performance.now();
    t0=now+(innerWidth<PHONE?1600:1000);last=now;          // attente après la fermeture de la tablette
    requestAnimationFrame(tick);
  }
  return {start};
})();

/* Production de DeliVrac et livraisons : une mise à jour par seconde */
setInterval(()=>{produce();arrive();Tab.dv();Term.refresh()},1000);

/* ---------- Déplacement : glisser (le point saisi reste sous le doigt) ou molette ---------- */
const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
const floor=new THREE.Plane(new THREE.Vector3(0,1,0),0);
function groundAt(ev){
  ndc.set(ev.clientX/innerWidth*2-1,-(ev.clientY/innerHeight)*2+1);
  ray.setFromCamera(ndc,camera);
  const p=new THREE.Vector3();
  return ray.ray.intersectPlane(floor,p)?p:null;
}
function clampT(){
  const mx=lerp(Math.min(innerWidth/2,WW/2),150,e), mz=lerp(Math.min(innerHeight/2,WH/2),150,e);
  target.x=clamp(target.x,-WW/2+mx,WW/2-mx);
  target.z=clamp(target.z,-WH/2+mz,WH/2-mz);
}
let grab=null, homing=false, homeTimer=0, tap=null;
function leave(){clearTimeout(homeTimer); homing=false}
function later(){clearTimeout(homeTimer); homeTimer=setTimeout(()=>{homing=true},HOME_DELAY)}

cv.addEventListener('pointerdown',ev=>{
  if(locked)return;
  const onBot=hitBot(ev);
  tap=onBot?{x:ev.clientX,y:ev.clientY,moved:false}:null;   // un simple clic sur Delivry ouvre/ferme la tablette
  grab=groundAt(ev); if(!grab) return;
  leave(); cv.classList.add('panning'); cv.setPointerCapture(ev.pointerId);
});
cv.addEventListener('pointermove',ev=>{
  if(!grab){cv.classList.toggle('hot',hitBot(ev)); return}
  if(tap&&Math.hypot(ev.clientX-tap.x,ev.clientY-tap.y)>6) tap.moved=true;
  const p=groundAt(ev); if(!p) return;
  target.x+=grab.x-p.x; target.z+=grab.z-p.z; clampT(); placeCam();
});
const stop=ev=>{
  if(!grab) return;
  grab=null; cv.classList.remove('panning');
  if(tap&&!tap.moved&&ev.type==='pointerup') Tab.toggle();
  tap=null; later();
};
cv.addEventListener('pointerup',stop);
cv.addEventListener('pointercancel',stop);
cv.addEventListener('wheel',ev=>{
  ev.preventDefault(); if(locked)return; leave();
  const k=1+.2*e;
  target.x+=(ev.shiftKey?ev.deltaY:ev.deltaX)*k;
  target.z+=(ev.shiftKey?0:ev.deltaY)*k;
  clampT(); placeCam(); later();
},{passive:false});

addEventListener('resize',()=>{
  renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
  sizeRT();
});

/* ---------- Boucle de rendu ---------- */
const clock=new THREE.Clock();
let off=0, offOn=false;                  // décalage de la vue : sur téléphone, Delivry monte quand la tablette est ouverte
bot.copy(target);
(function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),.05), t=clock.elapsedTime;

  m=clamp(m+(goal?dt:-dt)/DURATION,0,1);
  e=m*m*(3-2*m);
  const dist2D=(innerHeight/2)/Math.tan(FOV*Math.PI/360);
  pitch=lerp(Math.PI/2,PITCH,e);
  dist=lerp(dist2D,DIST,e);
  scene.fog.near=dist*1.4; scene.fog.far=dist*4.2;
  fscene.fog.near=dist*1.4; fscene.fog.far=dist*4.2;

  const want=(Tab.shown&&innerWidth<PHONE)?1:0;
  off+=(want-off)*Math.min(1,dt*6);
  if(off>.002){
    camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.3*off,innerWidth,innerHeight); offOn=true;
  }else if(offOn){camera.clearViewOffset(); offOn=false}

  clampT(); placeCam();

  if(homing){
    const dx=target.x-bot.x, dz=target.z-bot.z, d=Math.hypot(dx,dz);
    if(d<1.5){bot.x=target.x; bot.z=target.z; homing=false}
    else{const k=Math.min(1,Math.max(d*.04,1.8)*dt*60/d); bot.x+=dx*k; bot.z+=dz*k}
  }

  const bs=lerp(BOT_2D,BOT_3D,e), bob=Math.sin(t*1.57)*8;
  sprite.scale.set(bs*aw,bs*ah,1);
  glow.scale.set(bs*2.2,bs*2.2,1);
  const h=lerp(8,bs*ah/2+45,e)+bob*e, z=bot.z-bob*(1-e);
  sprite.position.set(bot.x,h,z);
  glow.position.set(bot.x,h,z);
  shadow.material.opacity=e;
  const s=bs*.42*(1-bob/90);
  shadow.position.x=bot.x; shadow.position.z=bot.z; shadow.scale.set(s,s,1);
  sprite2.position.copy(sprite.position); sprite2.scale.copy(sprite.scale);   // Delivry dans l'usine
  glow2.position.copy(glow.position);     glow2.scale.copy(glow.scale);
  shadow2.position.copy(shadow.position); shadow2.scale.copy(shadow.scale);
  Holo.update(dt,bs*ah);                        // plaque holographique de PaperEdit
  

  const dest=env==='factory'?scene:fscene, cur=env==='factory'?fscene:scene;   // le portail montre l'autre monde
  if(P){
    const pr=renderer.getPixelRatio();
    PU.uC.value.set(P.x*pr,(innerHeight-P.y)*pr); PU.uR.value=P.r*pr; PU.uT.value=t; PU.uRes.value.set(rt.width,rt.height);
    renderer.setRenderTarget(rt); renderer.render(dest,camera); renderer.setRenderTarget(null);
    renderer.render(cur,camera);
    renderer.autoClear=false; renderer.render(qscene,qcam); renderer.autoClear=true;
  }else renderer.render(cur,camera);
})();