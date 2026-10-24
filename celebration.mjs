// Canvas particles have independent starts, velocities, sizes and flutter phases.
const palette=['#edb54b','#e47f74','#71b79b','#85b8da','#b19bd1','#f4d878','#d693bd'];
export function celebrationParticles(width,height,effect='confetti',direction='down',random=Math.random){
  const count=effect==='balloons'?18:effect==='bubbles'?32:115,up=direction==='up';
  return Array.from({length:count},()=>({x:random()*width,y:up?height+20+random()*height*.5:-20-random()*height*.6,vx:(random()-.5)*(effect==='balloons'?30:150),vy:(up?-1:1)*(effect==='balloons'?75+random()*115:180+random()*250),size:effect==='balloons'?17+random()*19:effect==='bubbles'?9+random()*18:3+random()*6,ratio:.5+random(),phase:random()*Math.PI*2,spin:(random()-.5)*8,rotation:random()*Math.PI*2,delay:random()*.75,color:palette[Math.floor(random()*palette.length)],shape:Math.floor(random()*3)}));
}
export function animateCelebration(canvas,{effect='confetti',direction='down',duration=3600}={}){
  const ctx=canvas.getContext('2d');if(!ctx)return ()=>{};
  const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height,dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const particles=celebrationParticles(width,height,effect,direction),start=performance.now();let frame=0,stopped=false;
  function paint(now){
    if(stopped)return;const time=(now-start)/1000;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    for(const p of particles){const t=time-p.delay;if(t<0)continue;const floating=effect==='balloons'||effect==='bubbles',gravity=floating?0:direction==='up'?72:112,x=p.x+p.vx*t+Math.sin(p.phase+t*(floating?1.4:3))*(floating?19:24)*t,y=p.y+p.vy*t+gravity*t*t/2;
      ctx.save();ctx.globalAlpha=Math.min(1,t*5,Math.max(0,(duration/1000-time)*3));ctx.translate(x,y);
      if(effect==='balloons'){
        const tilt=Math.sin(p.phase+t*1.3)*.13;ctx.rotate(tilt);const rx=p.size,ry=p.size*1.3;const gradient=ctx.createRadialGradient(-rx*.4,-ry*.4,1,0,0,ry*1.2);gradient.addColorStop(0,'#fff3');gradient.addColorStop(.2,p.color);gradient.addColorStop(1,p.color+'bb');ctx.fillStyle=gradient;ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff60';ctx.beginPath();ctx.ellipse(-rx*.35,-ry*.35,rx*.16,ry*.3,-.4,0,Math.PI*2);ctx.fill();ctx.fillStyle=p.color;ctx.beginPath();ctx.moveTo(0,ry-1);ctx.lineTo(-4,ry+7);ctx.lineTo(4,ry+7);ctx.closePath();ctx.fill();ctx.strokeStyle='#78958b99';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(0,ry+7);ctx.bezierCurveTo(Math.sin(t+p.phase)*22,ry+30,-Math.sin(t+p.phase)*20,ry+54,Math.sin(t+p.phase)*11,ry+85);ctx.stroke();
      }else if(effect==='bubbles'){ctx.strokeStyle=p.color;ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(0,0,p.size,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#ffffff70';ctx.beginPath();ctx.arc(0,0,p.size*.72,Math.PI,Math.PI*1.5);ctx.stroke();}
      else{ctx.rotate(p.rotation+p.spin*t);ctx.scale(Math.max(.12,Math.abs(Math.cos(p.phase+t*5))),1);ctx.fillStyle=p.color;
        if(effect==='stars'){ctx.beginPath();for(let i=0;i<10;i++){const angle=i*Math.PI/5-Math.PI/2,r=i%2?p.size*.45:p.size;const px=Math.cos(angle)*r,py=Math.sin(angle)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();}
        else if(p.shape===1){ctx.beginPath();ctx.ellipse(0,0,p.size*.65,p.size,0,0,Math.PI*2);ctx.fill();}
        else{ctx.fillRect(-p.size*.5,-p.size*p.ratio,p.size,p.size*2*p.ratio);}
      }
      ctx.restore();
    }
    if(time<duration/1000)frame=requestAnimationFrame(paint);
  }
  frame=requestAnimationFrame(paint);return ()=>{stopped=true;cancelAnimationFrame(frame);ctx.clearRect(0,0,canvas.width,canvas.height);};
}
