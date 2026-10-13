/* Encoder Drive II — self-contained software 3D renderer and arcade vehicle model. */
'use strict';
window.Drive = (() => {
  const $ = id => document.getElementById(id);
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const lerp = (a,b,t) => a+(b-a)*t;
  const mixAngle = (a,b,t) => a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
  const roadX = z => 18*Math.sin(z/340)+9*Math.sin(z/145);
  const roadYaw = z => Math.atan(18/340*Math.cos(z/340)+9/145*Math.cos(z/145));
  const lanes = [-5.4,-1.8,1.8,5.4];
  const mobileDevice = window.matchMedia('(max-width: 1000px)').matches;
  let randomSeed=729;
  const random = () => {randomSeed=(1664525*randomSeed+1013904223)>>>0;return randomSeed/4294967296};
  const player={x:1.8,z:0,yaw:roadYaw(0),speed:0,vx:0,vz:0,steer:0,wheel:0,throttle:0,brake:0,roll:0,pitch:0,damage:0};
  const input={steer:0,accel:0,brake:0,serial:false,blocked:false,releaseRequired:false};
  const state={time:0,distance:0,passed:0,crashed:false,crashTime:0,impact:0,severe:false,paused:false,camera:'chase',sensitivity:.8};
  const keys=new Set(), traffic=[],particles=[],skids=[];
  let lastSkid=0,particleClock=0,crashSpin=0,hardwareReset=()=>{},crashedCar=null;
  const canvas=$('scene'), ctx=canvas.getContext('2d');
  let W=1,H=1,F=1,horizon=1,lastFrame=0,accumulator=0,lastHUD=0;
  const cam={x:0,y:3.6,z:-10,yaw:roadYaw(0)};
  function message(text){$('message').textContent=text}
  function addTraffic(){traffic.length=0;for(let i=0;i<(mobileDevice?14:24);i++){const lane=i===0?2:(i*3+Math.floor(i/4))%4;const z=48+i*34;traffic.push({id:i,lane,x:roadX(z)+lanes[lane],z,yaw:roadYaw(z),speed:15+lane*2+random()*5,target:15+lane*2+random()*5,color:['#cbe3e7','#e56e40','#356f8b','#ccae69','#849f8f','#ae493e'][i%6],kind:i%5===0?'suv':'sedan',damage:0,passed:false,vx:0,vz:0,spin:0})}}
  function safeStop(){keys.clear();player.speed=player.vx=player.vz=player.throttle=player.brake=0;input.accel=input.brake=0;hardwareReset()}
  function reset(){safeStop();Object.assign(player,{x:roadX(0)+1.8,z:0,yaw:roadYaw(0),steer:0,wheel:0,roll:0,pitch:0,damage:0});Object.assign(state,{distance:0,passed:0,crashed:false,crashTime:0,impact:0,severe:false,paused:false});particles.length=skids.length=0;crashedCar=null;crashSpin=0;addTraffic();setCamera(true);$('incident').hidden=true;$('paused').hidden=true;$('pause').textContent='Pause [P]';message(input.serial?'Car reset. Release both buttons and press the encoder switch to center.':'Ready. Hold W or the accelerator to drive.');updateHUD()}
  function pause(value=!state.paused){state.paused=value;safeStop();$('paused').hidden=!value;$('pause').textContent=value?'Resume [P]':'Pause [P]';if(!value)message('Release both physical buttons, then accelerate to continue.')}
  function switchCamera(){state.camera=state.camera==='chase'?'hood':'chase';$('cameraLabel').textContent=state.camera==='chase'?'CHASE CAMERA':'HOOD CAMERA';setCamera(true)}
  function corners(a){const w=a.kind==='suv'?1.08:1.0,l=a.kind==='suv'?2.4:2.25;return [[-w,-l],[w,-l],[w,l],[-w,l]].map(([x,z])=>({x:a.x+x*Math.cos(a.yaw)+z*Math.sin(a.yaw),z:a.z-x*Math.sin(a.yaw)+z*Math.cos(a.yaw)}))}
  function overlap(a,b){const pa=corners(a),pb=corners(b);for(const yaw of [a.yaw,b.yaw])for(const axis of [[Math.cos(yaw),-Math.sin(yaw)],[Math.sin(yaw),Math.cos(yaw)]]){const aa=pa.map(p=>p.x*axis[0]+p.z*axis[1]),bb=pb.map(p=>p.x*axis[0]+p.z*axis[1]);if(Math.max(...aa)<Math.min(...bb)||Math.max(...bb)<Math.min(...aa))return false}return true}
  function burst(x,z,amount){for(let i=0;i<amount;i++){const spark=i%3===0;particles.push({type:spark?'spark':'debris',x,y:.6+random(),z,vx:(random()-.5)*12+player.vx*.3,vy:2+random()*7,vz:(random()-.5)*12+player.vz*.3,life:spark?.7+random():2+random()*2,max:4,size:spark?.035:.05+random()*.15,rot:random()*6,color:i%2?'#35444e':'#91abb5'})}}
  function crash(other=null){if(state.crashed)return;const relative=other?Math.hypot(player.vx-Math.sin(other.yaw)*other.speed,player.vz-Math.cos(other.yaw)*other.speed):player.speed;state.impact=relative*3.6;state.crashed=true;state.crashTime=0;state.severe=relative>22;player.damage=clamp(.25+relative/42,.25,1);crashSpin=(random()>.5?1:-1)*(.35+relative*.045);burst(player.x,player.z+1.5,Math.round(35+relative*2));if(other){other.damage=player.damage;other.vx=player.vx*.38;other.vz=player.vz*.5;other.spin=-crashSpin*.6;crashedCar=other;player.vx*=.4;player.vz*=.45}else{player.vx*=-.28;player.vz*=.45}player.speed=Math.hypot(player.vx,player.vz);keys.clear();input.accel=0;hardwareReset();$('incidentType').textContent=other?'TRAFFIC COLLISION':'GUARDRAIL IMPACT';$('incidentTitle').textContent=state.severe?'Heavy impact':'Drive ended';$('incidentText').textContent='Relative impact '+Math.round(state.impact)+' km/h. Release the buttons, then restart when ready.';message('Collision. Let the car settle, then restart your drive.');audio.impact(relative)}
  function moveTraffic(dt){for(const car of traffic){if(car.damage){car.x+=car.vx*dt;car.z+=car.vz*dt;car.yaw+=car.spin*dt;car.vx*=Math.exp(-1.3*dt);car.vz*=Math.exp(-1.3*dt);car.spin*=Math.exp(-1.8*dt);car.speed=Math.hypot(car.vx,car.vz);continue}let target=car.target;for(const ahead of traffic){const gap=ahead.z-car.z;if(ahead!==car&&ahead.lane===car.lane&&gap>0&&gap<35)target=Math.min(target,Math.max(0,ahead.speed+(gap-13)*.65))}car.speed=lerp(car.speed,target,1-Math.exp(-2*dt));car.z+=car.speed*dt;car.x=roadX(car.z)+lanes[car.lane];car.yaw=roadYaw(car.z);if(car.z<player.z-6&&!car.passed){car.passed=true;if(!state.crashed)state.passed++}if(car.z<player.z-65||car.z>player.z+1100){car.z=player.z+680+random()*320;car.x=roadX(car.z)+lanes[car.lane];car.yaw=roadYaw(car.z);car.passed=false}}}
  function step(dt){if(state.paused||input.blocked){audio.update(0,0);return}state.time+=dt;moveTraffic(dt);if(state.crashed){state.crashTime+=dt;player.x+=player.vx*dt;player.z+=player.vz*dt;player.yaw+=crashSpin*dt;player.vx*=Math.exp(-1.7*dt);player.vz*=Math.exp(-1.7*dt);crashSpin*=Math.exp(-1.35*dt);player.speed=Math.hypot(player.vx,player.vz);player.roll=lerp(player.roll,Math.sin(state.crashTime*8)*Math.exp(-state.crashTime*2)*.16,dt*8);player.throttle=0;player.brake=1;if(state.crashTime>1.5)$('incident').hidden=false}else{
      const left=keys.has('KeyA')||keys.has('ArrowLeft'),right=keys.has('KeyD')||keys.has('ArrowRight');
      const targetSteer=input.serial&&!left&&!right?input.steer:((right?1:0)-(left?1:0))*100;
      player.steer=lerp(player.steer,targetSteer,1-Math.exp(-10*dt));
      const braking=!!(input.brake||keys.has('KeyS')||keys.has('ArrowDown'));
      const accelerating=!!(input.accel||keys.has('KeyW')||keys.has('ArrowUp'));
      player.brake=braking?1:0;player.throttle=accelerating&&!braking?1:0;
      const previousSpeed=player.speed,offset=Math.abs(player.x-roadX(player.z));
      const drag=.24+.0030*player.speed*player.speed+(offset>7.25?3:0);
      player.speed=clamp(player.speed+(player.throttle*8.5-player.brake*14-drag)*dt,0,56);
      player.wheel=player.steer/100*state.sensitivity*(.50/(1+player.speed*.05));
      const idealYaw=player.speed/2.7*Math.tan(player.wheel);
      const yawRate=clamp(idealYaw,-8.8/Math.max(player.speed,2),8.8/Math.max(player.speed,2));
      player.yaw+=yawRate*dt;
      const relativeYaw=Math.atan2(Math.sin(player.yaw-roadYaw(player.z)),Math.cos(player.yaw-roadYaw(player.z)));
      player.yaw=roadYaw(player.z)+clamp(relativeYaw,-1.3,1.3);
      const response=1-Math.exp(-8*dt);
      player.vx=lerp(player.vx,Math.sin(player.yaw)*player.speed,response);
      player.vz=lerp(player.vz,Math.cos(player.yaw)*player.speed,response);
      if(player.speed<.02)player.vx=player.vz=0;
      player.x+=player.vx*dt;player.z+=player.vz*dt;state.distance+=Math.hypot(player.vx,player.vz)*dt;
      player.roll=lerp(player.roll,-yawRate*player.speed*.007,1-Math.exp(-5*dt));
      player.pitch=lerp(player.pitch,(player.speed-previousSpeed)/dt*.007,1-Math.exp(-6*dt));
      if(player.speed>8&&(braking||Math.abs(idealYaw)>Math.abs(yawRate)+.12)&&state.time-lastSkid>.04){lastSkid=state.time;skids.push({x:player.x,z:player.z,yaw:player.yaw});if(skids.length>220)skids.shift()}
      for(const car of traffic)if(Math.abs(car.z-player.z)<6&&Math.abs(car.x-player.x)<5&&overlap(player,car)){crash(car);break}
      if(!state.crashed&&corners(player).some(p=>Math.abs(p.x-roadX(p.z))>9.0))crash();
    }
    if(state.crashed){particleClock+=dt;while(particleClock>.055&&state.crashTime<10){particleClock-=.055;particles.push({type:'smoke',x:player.x+Math.sin(player.yaw)*1.1,y:.85,z:player.z+Math.cos(player.yaw)*1.1,vx:(random()-.5)*.4,vy:.6+random(),vz:-.3,life:2+random()*2,max:4,size:.25+random()*.4,rot:0});if(state.severe&&state.crashTime<5)particles.push({type:'flame',x:player.x+(random()-.5)*.7,y:.8,z:player.z+.8,vx:0,vy:1.5,vz:0,life:.3+random()*.4,max:.7,size:.18+random()*.3,rot:0})}}
    for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;if(p.life<=0){particles.splice(i,1);continue}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.rot+=dt*3;if(p.type==='debris'||p.type==='spark'){p.vy-=9.81*dt;if(p.y<.03){p.y=.03;p.vy=Math.abs(p.vy)*.25;p.vx*=.7;p.vz*=.7}}else p.size+=dt*.35}
    audio.update(player.speed,player.throttle);
  }
  function setCamera(immediate=false,dt=.016){const hood=state.camera==='hood',back=hood?.6:12.8+player.speed*.035;const targetYaw=state.crashed?roadYaw(player.z):player.yaw;const t=immediate?1:1-Math.exp(-5*dt);cam.yaw=mixAngle(cam.yaw,targetYaw,t);const targetX=player.x-Math.sin(cam.yaw)*back,targetZ=player.z-Math.cos(cam.yaw)*back;cam.x=lerp(cam.x,targetX,immediate?1:1-Math.exp(-9*dt));cam.z=lerp(cam.z,targetZ,immediate?1:1-Math.exp(-9*dt));cam.y=lerp(cam.y,hood?1.5:3.6,immediate?1:1-Math.exp(-5*dt))}
  // Perspective projection and near-plane clipping, with a yaw-following camera.
  function view(p){const dx=p[0]-cam.x,dz=p[2]-cam.z;return[dx*Math.cos(cam.yaw)-dz*Math.sin(cam.yaw),p[1]-cam.y,dx*Math.sin(cam.yaw)+dz*Math.cos(cam.yaw)]}
  function screen(p){return[W/2+p[0]*F/p[2],horizon-p[1]*F/p[2]]}
  function poly(points,color,alpha=1){let transformed=points.map(view),clipped=[];for(let i=0;i<transformed.length;i++){const a=transformed[i],b=transformed[(i+1)%transformed.length],ia=a[2]>.2,ib=b[2]>.2;if(ia)clipped.push(a);if(ia!==ib){const t=(.20001-a[2])/(b[2]-a[2]);clipped.push([lerp(a[0],b[0],t),lerp(a[1],b[1],t),.20001])}}if(clipped.length<3)return;const pp=clipped.map(screen);ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<pp.length;i++)i?ctx.lineTo(...pp[i]):ctx.moveTo(...pp[i]);ctx.closePath();ctx.fill();if(alpha===1){ctx.strokeStyle=color;ctx.lineWidth=.5;ctx.stroke()}ctx.globalAlpha=1}
  function line(points,color,width=1){const pp=points.map(view);if(pp.some(p=>p[2]<.25))return;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();pp.map(screen).forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.stroke()}
  function quad(l,r,z1,z2,color,y=0){poly([[roadX(z1)+l,y,z1],[roadX(z1)+r,y,z1],[roadX(z2)+r,y,z2],[roadX(z2)+l,y,z2]],color)}
  function resize(){const box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,mobileDevice?1.15:1.7);W=Math.max(1,box.width);H=Math.max(1,box.height);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);F=Math.min(W*.88,H*1.5);horizon=H*(H<480?.37:.42)}
  function mountain(base,amplitude,color,seed){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H);for(let x=-30;x<W+30;x+=15){const n=x/W+cam.yaw*.24;const h=.45+.25*Math.sin(n*16+seed)+.18*Math.sin(n*39+seed*3)+.1*Math.sin(n*85+seed);ctx.lineTo(x,base-amplitude*h)}ctx.lineTo(W,H);ctx.closePath();ctx.fill()}
  function background(){const sky=ctx.createLinearGradient(0,0,0,H*.6);sky.addColorStop(0,'#4e90b4');sky.addColorStop(.65,'#afcfdb');sky.addColorStop(1,'#f1e1bf');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);const sunX=W*(.77-cam.yaw*.3),sunY=H*.18;const glow=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,H*.4);glow.addColorStop(0,'#fff8cfbb');glow.addColorStop(.2,'#fff2ba44');glow.addColorStop(1,'#fff1c000');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff4d7';ctx.beginPath();ctx.arc(sunX,sunY,H*.032,0,Math.PI*2);ctx.fill();mountain(horizon+24,H*.22,'#668c9d',1);mountain(horizon+45,H*.19,'#477589',4);mountain(horizon+67,H*.15,'#52756c',8);ctx.fillStyle='#799383';ctx.fillRect(0,horizon+34,W,H); // rolling ocean glints and atmospheric clouds
    ctx.save();ctx.globalAlpha=.17;for(let i=0;i<12;i++){const x=((i*191+Math.sin(i*71)*150-cam.yaw*100)% (W+250)+W+250)%(W+250)-110,y=H*(.11+(i%4)*.075);ctx.fillStyle='#f9fcf9';ctx.beginPath();ctx.ellipse(x,y,35+i%3*17,5+i%2*4,0,0,Math.PI*2);ctx.ellipse(x+27,y+1,26,5,0,0,Math.PI*2);ctx.fill()}ctx.restore();}
  function road(){
    const base=Math.floor((player.z-45)/8)*8,end=base+920;
    // Continuous ribbons avoid seams between independently rasterized segments.
    const ribbon=(left,right,color,y=0)=>{const points=[];for(let z=base;z<=end;z+=8)points.push([roadX(z)+left,y,z]);for(let z=end;z>=base;z-=8)points.push([roadX(z)+right,y,z]);poly(points,color)};
    ribbon(-350,350,'#76907a');ribbon(-350,-28,'#477f8f');ribbon(-28,-19,'#b5c5aa');ribbon(-19,-9,'#829d81');ribbon(-9.2,9.2,'#a29b85');ribbon(-8.65,8.65,'#5b6770');ribbon(-7.3,7.3,'#354652');ribbon(-7.23,-7.1,'#e2e4ce',.01);ribbon(7.1,7.23,'#e2e4ce',.01);ribbon(-8.3,-8.22,'#e9c987',.01);ribbon(8.22,8.3,'#e9c987',.01);
    for(let z=end;z>=base;z-=8){for(const x of [-3.6,0,3.6])quad(x-.06,x+.06,z,z+4,'#e5e7da',.012);
      if(z>player.z-3&&z<player.z+250){for(const x of [-9.05,9.05]){const x1=roadX(z)+x,x2=roadX(z+8)+x;poly([[x1,.52,z],[x1,.75,z],[x2,.75,z+8],[x2,.52,z+8]],'#b5c6c9');poly([[x1-.045,0,z],[x1+.045,0,z],[x1+.045,.87,z],[x1-.045,.87,z]],'#738b94');poly([[x1-.08,.70,z],[x1+.08,.70,z],[x1+.08,.85,z],[x1-.08,.85,z]],'#ffe2a2')}}
    }
    for(const s of skids){if(Math.abs(s.z-player.z)>130)continue;for(const x of [-.82,.82]){const points=[[x-.065,-.5],[x+.065,-.5],[x+.065,.5],[x-.065,.5]].map(([xx,zz])=>[s.x+xx*Math.cos(s.yaw)+zz*Math.sin(s.yaw),.015,s.z-xx*Math.sin(s.yaw)+zz*Math.cos(s.yaw)]);poly(points,'#142129',.6)}}
  }
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  function shade(hex,k){const a=rgb(hex);return '#'+a.map(v=>Math.round(clamp(v*k,0,255)).toString(16).padStart(2,'0')).join('')}
  // Coupe geometry: tapered body, sloped glass, wheel cylinders, mirrors, lights.
  function mesh(car){const faces=[];const color=car.damage?shade(car.color||'#96c5d0',.78):(car.color||'#9bcbd6');const suv=car.kind==='suv',roof=suv?1.75:1.32;
    const face=(v,c)=>faces.push({v,c});
    const ring0=[[-.81,.28,-2.23],[.81,.28,-2.23],[.88,.28,2.03],[-.88,.28,2.03]];
    const ring1=[[-.99,.67,-2.12],[.99,.67,-2.12],[.93,.69,2.17],[-.93,.69,2.17]];
    const ring2=[[-.91,.88,-1.94],[.91,.88,-1.94],[.82,.80,1.95],[-.82,.80,1.95]];
    for(let i=0;i<4;i++){const j=(i+1)%4;face([ring0[i],ring0[j],ring1[j],ring1[i]],shade(color,i%2?.66:.74));face([ring1[i],ring1[j],ring2[j],ring2[i]],shade(color,i%2?.82:.97))}face(ring2,color);
    const lower=[[-.80,.91,-1.31],[.80,.91,-1.31],[.77,.88,1.05],[-.77,.88,1.05]];
    const upper=[[-.64,roof,-.71],[.64,roof,-.71],[.61,roof,.35],[-.61,roof,.35]];
    face([lower[0],lower[1],upper[1],upper[0]],'#244c60');face([lower[1],lower[2],upper[2],upper[1]],'#1c3e53');face([lower[2],lower[3],upper[3],upper[2]],'#6299ad');face([lower[3],lower[0],upper[0],upper[3]],'#305e73');face(upper,shade(color,1.15));
    face([[-.80,.91,-1.25],[-.78,.91,-1.14],[-.63,roof,-.59],[-.64,roof,-.69]],color);
    face([[.8,.91,-1.25],[.78,.91,-1.14],[.63,roof,-.59],[.64,roof,-.69]],color);
    for(const side of [-1,1]){face([[side*.79,.90,-.05],[side*.78,.90,.03],[side*.62,roof,.03],[side*.63,roof,-.05]],'#112936');face([[side*.96,.70,-.7],[side*.965,.70,.85],[side*.91,.85,.82],[side*.915,.85,-.7]],shade(color,.93));face([[side*.95,.81,-.6],[side*.96,.81,-.35],[side*.96,.835,-.35],[side*.95,.835,-.6]],'#c5dfe4');face([[side*.81,.92,.62],[side*1.12,.93,.61],[side*1.12,1.01,.40],[side*.80,1.02,.42]],shade(color,.75));}
    // Rear fascia and paired LED strips.
    face([[-.78,.33,-2.24],[.78,.33,-2.24],[.84,.53,-2.20],[-.84,.53,-2.20]],'#14222d');
    for(const side of [-1,1]){const light=car===player&&player.brake?'#ff674d':'#dc624f';face([[side*.28,.70,-2.134],[side*.84,.70,-2.134],[side*.84,.78,-2.088],[side*.28,.78,-2.088]],light);face([[side*.37,.69,2.185],[side*.81,.69,2.185],[side*.79,.76,2.12],[side*.36,.76,2.12]],'#eaf9f8');face([[side*.54,.33,-2.25],[side*.77,.33,-2.25],[side*.77,.43,-2.25],[side*.54,.43,-2.25]],'#8ba6b5')}
    face([[-.24,.51,-2.23],[.24,.51,-2.23],[.24,.61,-2.23],[-.24,.61,-2.23]],'#d5e3d8');
    face([[-.78,.36,2.115],[.78,.36,2.115],[.72,.55,2.19],[-.72,.55,2.19]],'#172b38');
    face([[-.76,.90,-1.87],[.76,.90,-1.87],[.76,.94,-1.65],[-.76,.94,-1.65]],shade(color,1.12));
    for(const z of [-1.40,1.32])for(const side of [-1,1]){const wheel=car===player&&z>0?player.wheel:0;const wc=side*.95;const wheelPoint=(x,y,d)=>[wc+x*Math.cos(wheel)+d*Math.sin(wheel),.39+y,z-x*Math.sin(wheel)+d*Math.cos(wheel)];for(let i=0;i<12;i++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;const pts=[wheelPoint(-.13,Math.sin(a)*.36,Math.cos(a)*.36),wheelPoint(.13,Math.sin(a)*.36,Math.cos(a)*.36),wheelPoint(.13,Math.sin(b)*.36,Math.cos(b)*.36),wheelPoint(-.13,Math.sin(b)*.36,Math.cos(b)*.36)];face(pts,i%2?'#1a2730':'#14212a');face([wheelPoint(side*.135,0,0),wheelPoint(side*.135,Math.sin(a)*.29,Math.cos(a)*.29),wheelPoint(side*.135,Math.sin(b)*.29,Math.cos(b)*.29)],i%2?'#aec1cc':'#334854');}}
    return faces;
  }
  const meshCache=new Map();
  function drawVehicle(car){const distance=view([car.x,0,car.z])[2];if(distance<.5||distance>850)return;const shadow=[[-1.1,-2.45],[1.1,-2.45],[1.1,2.4],[-1.1,2.4]].map(([x,z])=>[car.x+x*Math.cos(car.yaw)+z*Math.sin(car.yaw),.02,car.z-x*Math.sin(car.yaw)+z*Math.cos(car.yaw)]);poly(shadow,'#0c2431',.40);const key=[car.color,car.kind,car.damage>0].join('/');let model;if(car===player)model=mesh(car);else{if(!meshCache.has(key))meshCache.set(key,mesh(car));model=meshCache.get(key)}const roll=car===player?player.roll:0,pitch=car===player?player.pitch:0;
    const world=([x,y,z])=>{if(car.damage&&z>1.2){z-=(z-1.2)*car.damage*.38;y+=Math.sin(x*5)*car.damage*.14}const yy=y+x*roll+z*pitch;return[car.x+x*Math.cos(car.yaw)+z*Math.sin(car.yaw),yy,car.z-x*Math.sin(car.yaw)+z*Math.cos(car.yaw)]};
    const faces=model.map(f=>{const v=f.v.map(world);return{v,c:f.c,d:v.reduce((s,p)=>s+view(p)[2],0)/v.length}}).sort((a,b)=>b.d-a.d);
    for(const face of faces)poly(face.v,face.c);
    if(distance>120){const fog=clamp((distance-120)/1100,0,.6);poly(shadow,'#b5cbd0',fog*.3)}
  }
  function tree(x,z,height,seed){const trunk=.18;poly([[x-trunk,0,z],[x+trunk,0,z],[x+trunk,height*.67,z],[x-trunk,height*.67,z]],'#5b6555');for(let i=0;i<3;i++){const y=height*(.22+i*.2),r=height*(.25-i*.045);const color=['#365d50','#3f715a','#527f61'][(i+seed)%3];poly([[x-r,y,z],[x+r,y,z],[x,height*(.65+i*.16),z]],color)}}
  function sign(z){const x=roadX(z)+11.5;for(const dx of [-1.6,1.6])poly([[x+dx-.055,0,z],[x+dx+.055,0,z],[x+dx+.055,4.2,z],[x+dx-.055,4.2,z]],'#a9c1cb');poly([[x-2,2.8,z],[x+2,2.8,z],[x+2,4.3,z],[x-2,4.3,z]],'#255b5a');const p=view([x,3.55,z]);if(p[2]>5&&p[2]<170){const a=screen(p),size=clamp(F/p[2]*.4,6,27);ctx.fillStyle='#e6f7eb';ctx.textAlign='center';ctx.font=`600 ${size}px system-ui`;ctx.fillText('COASTAL RUN',a[0],a[1]);ctx.font=`${size*.7}px system-ui`;ctx.fillText('KEEP YOUR DISTANCE',a[0],a[1]+size*1.4)}}
  function scenery(){const objects=[];const start=Math.floor((player.z-30)/25)*25;for(let z=start;z<player.z+800;z+=25){const i=Math.abs(Math.floor(z/25));objects.push({z,draw:()=>tree(roadX(z)+14+(i%4)*2,z,4+i%4,i)});if(i%3===0)objects.push({z:z+8,draw:()=>tree(roadX(z+8)-15,z+8,4.2,i)});if(i%9===0)objects.push({z:z+3,draw:()=>sign(z+3)})}for(const car of traffic)objects.push({z:car.z,draw:()=>drawVehicle(car)});if(state.camera==='chase'||state.crashed)objects.push({z:player.z,draw:()=>drawVehicle(player)});objects.sort((a,b)=>b.z-a.z).forEach(o=>o.draw())}
  function effects(){const sorted=[...particles].sort((a,b)=>view([b.x,b.y,b.z])[2]-view([a.x,a.y,a.z])[2]);for(const p of sorted){const point=view([p.x,p.y,p.z]);if(point[2]<.4)continue;const [x,y]=screen(point),size=clamp(F/point[2]*p.size,.3,170);ctx.globalAlpha=clamp(p.life/p.max,0,.8);if(p.type==='smoke'){const smoke=ctx.createRadialGradient(x,y,0,x,y,size);smoke.addColorStop(0,'#48525abb');smoke.addColorStop(.6,'#6d777b70');smoke.addColorStop(1,'#7b898e00');ctx.fillStyle=smoke;ctx.fillRect(x-size,y-size,size*2,size*2)}else if(p.type==='flame'){ctx.globalAlpha=.8;const glow=ctx.createRadialGradient(x,y,0,x,y,size);glow.addColorStop(0,'#fff1aa');glow.addColorStop(.35,'#ffb443');glow.addColorStop(.7,'#ff622660');glow.addColorStop(1,'#ed402000');ctx.fillStyle=glow;ctx.fillRect(x-size,y-size,size*2,size*2)}else{ctx.save();ctx.translate(x,y);ctx.rotate(p.rot);ctx.fillStyle=p.type==='spark'?'#ffe6a8':p.color;ctx.fillRect(-size,-size,size*2,size*(p.type==='spark'?4:1));ctx.restore()}ctx.globalAlpha=1}}
  function hood(){if(state.camera!=='hood'||state.crashed)return;const bonnet=ctx.createLinearGradient(0,H*.82,0,H);bonnet.addColorStop(0,'#b8d8df');bonnet.addColorStop(1,'#376578');ctx.fillStyle=bonnet;ctx.beginPath();ctx.moveTo(W*.23,H);ctx.lineTo(W*.32,H*.88);ctx.quadraticCurveTo(W*.5,H*.84,W*.68,H*.88);ctx.lineTo(W*.77,H);ctx.fill();ctx.strokeStyle='#d3e6e9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(W*.38,H);ctx.lineTo(W*.42,H*.89);ctx.moveTo(W*.62,H);ctx.lineTo(W*.58,H*.89);ctx.stroke()}
  function render(){ctx.save();if(state.crashed&&state.crashTime<1){const shake=(1-state.crashTime)*Math.min(state.impact*.14,12);ctx.translate(Math.sin(state.time*91)*shake,Math.cos(state.time*77)*shake*.5)}background();road();scenery();effects();hood();ctx.restore();const vignette=ctx.createLinearGradient(0,0,0,H);vignette.addColorStop(0,'#071b3040');vignette.addColorStop(.25,'#041b2800');vignette.addColorStop(.7,'#041b2800');vignette.addColorStop(1,'#03111c80');ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);if(state.crashed&&state.crashTime<.4){ctx.fillStyle=`rgba(255,193,145,${(.4-state.crashTime)*.6})`;ctx.fillRect(0,0,W,H)}}
  const audio=(()=>{let ac=null,osc=null,harmonic=null,gain=null,enabled=false;function toggle(){try{if(!ac){ac=new(window.AudioContext||window.webkitAudioContext)();gain=ac.createGain();gain.gain.value=0;gain.connect(ac.destination);osc=ac.createOscillator();osc.type='sawtooth';harmonic=ac.createOscillator();harmonic.type='triangle';osc.connect(gain);harmonic.connect(gain);osc.start();harmonic.start()}enabled=!enabled;void ac.resume();$('sound').textContent=enabled?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(enabled));if(!enabled)gain.gain.setTargetAtTime(0,ac.currentTime,.05)}catch{message('Audio is unavailable in this browser. Driving controls still work.')}}function update(speed,throttle){if(!ac)return;const active=enabled&&!state.paused&&!input.blocked&&!state.crashed;const gear=1+Math.floor(speed/11),rpm=45+(speed%11)*7+throttle*20;osc.frequency.setTargetAtTime(rpm,ac.currentTime,.06);harmonic.frequency.setTargetAtTime(rpm*.5,ac.currentTime,.06);gain.gain.setTargetAtTime(active?.006+throttle*.010:0,ac.currentTime,.07)}function impact(strength){if(!ac||!enabled)return;const count=ac.sampleRate*.55,buffer=ac.createBuffer(1,count,ac.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<count;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/count*7);const source=ac.createBufferSource(),g=ac.createGain(),filter=ac.createBiquadFilter();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=1600;g.gain.value=clamp(strength*.012,.06,.35);source.connect(filter);filter.connect(g);g.connect(ac.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect()}}return{toggle,update,impact}})();
  function updateHUD(){const speed=Math.round(player.speed*3.6);$('speed').textContent=speed;$('speedBar').style.width=clamp(speed/2,0,100)+'%';$('gear').textContent=state.crashed?'!':speed<1?'N':1+Math.min(5,Math.floor(speed/35));const steering=Math.round(player.steer);$('steer').textContent=(steering>0?'+':'')+steering;$('needle').style.left=(steering+100)/2+'%';$('distance').textContent=(state.distance/1000).toFixed(2);$('passed').textContent=state.passed+' overtakes';$('accelValue').textContent=player.throttle?'100%':'0%';$('brakeValue').textContent=player.brake?'100%':'0%';$('acceleratorLed').classList.toggle('active',!!player.throttle);$('brakeLed').classList.toggle('braking',!!player.brake);$('driveHint').textContent=state.crashed?'Release controls, then restart':input.blocked?'Controller unavailable — vehicle stopped':input.releaseRequired?'Release both physical buttons to arm controls':player.speed<.2?'Hold W / ↑ or the accelerator button to drive':'Keep your distance · Brake before overtaking'}

  async function tryLandscapeLock(){
    try{if(screen.orientation&&screen.orientation.lock)await screen.orientation.lock('landscape')}catch{}
  }
  const driving=['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  window.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.ctrlKey||e.altKey||e.metaKey)return;if(driving.includes(e.code)){e.preventDefault();if(!state.paused&&!state.crashed&&!input.blocked)keys.add(e.code)}if(!e.repeat&&e.code==='KeyC')switchCamera();if(!e.repeat&&e.code==='KeyP')pause()});window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true)});
  document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(!state.paused&&!state.crashed&&!input.blocked){keys.add(button.dataset.key);button.classList.add('pressed')}});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>{keys.delete(button.dataset.key);button.classList.remove('pressed')})});
  $('fullscreen').addEventListener('click',async()=>{const target=document.getElementById('game');try{if(document.fullscreenElement)await document.exitFullscreen();else if(target.requestFullscreen){await target.requestFullscreen();await tryLandscapeLock()}else message('Use landscape orientation for the best phone driving view.')}catch{message('Fullscreen is not supported here. Turn the phone sideways for a wider view.')}});
  document.addEventListener('fullscreenchange',()=>{$('fullscreen').textContent=document.fullscreenElement?'Exit full screen':'Full screen';resize()});
  $('reset').addEventListener('click',reset);$('restart').addEventListener('click',reset);$('pause').addEventListener('click',()=>pause());$('camera').addEventListener('click',switchCamera);$('sound').addEventListener('click',audio.toggle);$('sensitivity').addEventListener('input',e=>{state.sensitivity=Number(e.target.value);$('sensitivityValue').textContent=state.sensitivity.toFixed(2)+'×'});
  new ResizeObserver(resize).observe(canvas);
  let lastRenderTime=0;
  function frame(now){const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;accumulator+=dt;while(accumulator>=1/120){step(1/120);accumulator-=1/120}if(!mobileDevice||now-lastRenderTime>=30){setCamera(false,Math.min((now-lastRenderTime)/1000||dt,.1));render();lastRenderTime=now}if(now-lastHUD>50){updateHUD();lastHUD=now}requestAnimationFrame(frame)}
  window.addEventListener('pointerdown',()=>{tryLandscapeLock()},{once:true});
  resize();reset();requestAnimationFrame(frame);
  return {player,input,state,traffic,keys,particles,reset,pause,safeStop,message,step,render,resize,updateHUD,switchCamera,roadX,roadYaw,overlap,setHardwareReset:fn=>{hardwareReset=fn}};
})();
