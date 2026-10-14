'use strict';
(() => {
 const film=document.querySelector('.emperor-film');if(!film)return;
 const video=film.querySelector('video'),poster=film.querySelector('img'),button=film.querySelector('button');
 const reduce=matchMedia('(prefers-reduced-motion: reduce)'),connection=navigator.connection;
 let seen=false,visible=false,userPaused=false,interrupted=false,ended=false,loading=false,failed=false;
 video.id='emperor-hero-video';video.muted=true;film.querySelector('.film-controls').hidden=false;
 const constrained=()=>connection?.saveData||['slow-2g','2g','3g'].includes(connection?.effectiveType);
 function still(){poster.src='/media/emperor-breakout/still.jpg';poster.alt='Win10min’s Roman emperor emerging through the broken phone screen';}
 if(seen||reduce.matches||constrained())still();
 function label(){const playing=!video.paused;button.setAttribute('aria-label',loading?'Loading animation':failed?'Retry animation':playing?'Pause animation':'Play animation');button.innerHTML=playing?'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/></svg>':'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 5v14l10-7z" fill="currentColor"/></svg>';button.disabled=loading;button.hidden=ended;}

 function pause(){video.pause();film.classList.remove('is-playing');if(!ended&&video.currentTime>0)film.classList.add('is-paused');label();}
 async function play(manual=false){if(loading)return;if(!manual&&(seen||reduce.matches||constrained()||!visible||document.hidden))return;
 userPaused=false;ended=false;failed=false;loading=true;label();
 if(!video.getAttribute('src')){video.src=innerWidth<=650?'/media/emperor-breakout/hero-480.mp4':'/media/emperor-breakout/hero-720.mp4';video.load();}
 if(video.ended)video.currentTime=0;
 try{await video.play();}catch{failed=true;film.classList.remove('is-playing','is-paused');still();}finally{loading=false;label();}
 }
 video.addEventListener('playing',()=>{loading=false;film.classList.add('is-playing');film.classList.remove('is-paused');seen=true;label();if(!visible||document.hidden)checkVisibility();});
 video.addEventListener('ended',()=>{ended=true;interrupted=false;film.classList.remove('is-playing','is-paused');still();label();});
 video.addEventListener('error',()=>{failed=true;loading=false;film.classList.remove('is-playing','is-paused');still();label();video.removeAttribute('src');});
 button.addEventListener('click',()=>{if(video.paused){play(true);}else{userPaused=true;interrupted=false;pause();}});
 function checkVisibility(){if(!visible||document.hidden){if(!video.paused){interrupted=true;pause();}}else if(interrupted&&!userPaused&&!ended&&!reduce.matches){interrupted=false;play(true);}}
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;checkVisibility();if(visible&&ready)play();},{threshold:.35}).observe(film.querySelector('.film-stage'));
 document.addEventListener('visibilitychange',checkVisibility);
 reduce.addEventListener('change',()=>{if(reduce.matches){userPaused=true;interrupted=false;pause();film.classList.remove('is-paused');still();}});
 connection?.addEventListener?.('change',()=>{if(constrained()){userPaused=true;pause();}});
 let ready=false;const enable=()=>{const run=()=>{ready=true;play();};if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1500});else setTimeout(run,150);};
 if(document.readyState==='complete')enable();else window.addEventListener('load',enable,{once:true});
 label();
})();
