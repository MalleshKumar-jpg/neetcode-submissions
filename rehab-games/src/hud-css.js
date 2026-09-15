export const HUD_CSS = `
:root{
  color-scheme: dark;
  --ink:#e8f2f6; --muted:#8fa6b2;
  --panel:rgba(6,14,20,.72); --panel-border:rgba(150,200,220,.18);
  --font:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --serif:'Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;background:#03080c;color:var(--ink);
  font-family:var(--font);overflow:hidden;overscroll-behavior:none}
#app{position:fixed;inset:0}
canvas#scene{display:block;width:100%;height:100%;touch-action:none}

#vignette{position:fixed;inset:0;pointer-events:none;z-index:5;
  background:radial-gradient(ellipse at center,transparent 52%,rgba(0,0,0,.55) 100%)}

#loading{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:16px;background:#03080c;transition:opacity .7s ease}
#loading.hidden{opacity:0;pointer-events:none}
#loading .ring{width:56px;height:56px;border-radius:50%;
  border:3px solid rgba(140,200,220,.15);border-top-color:#7fd4e8;animation:spin 1.1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#loading .t{font-family:var(--serif);font-size:1.4rem;letter-spacing:.05em;color:#a8dcea}
#loading .s{font-size:.82rem;color:var(--muted)}

#intro,#summary{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;
  padding:24px;background:rgba(2,7,10,.82);backdrop-filter:blur(7px);transition:opacity .5s ease}
#intro.hidden,#summary:not(.visible){opacity:0;pointer-events:none}
#summary{opacity:0;pointer-events:none}
#summary.visible{opacity:1;pointer-events:auto}
.card{max-width:560px;width:100%;background:var(--panel);border:1px solid var(--panel-border);
  border-radius:18px;padding:30px 32px;box-shadow:0 24px 70px rgba(0,0,0,.6)}
.card h1{font-family:var(--serif);font-weight:500;font-size:1.9rem;margin:0 0 12px;letter-spacing:.01em}
.card p{font-size:.86rem;line-height:1.65;color:#c2d4dc;margin:0 0 18px}
.card p.fine{font-size:.7rem;color:var(--muted);margin:16px 0 0;line-height:1.6}

.proto{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}
.proto span{font-size:.66rem;letter-spacing:.06em;padding:5px 9px;border-radius:7px;
  background:rgba(120,190,215,.09);border:1px solid rgba(140,200,225,.16);color:#9fc4d4}

.row{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px}
.row label{font-size:.76rem;color:#b3c7d1;display:flex;align-items:center;gap:8px}
.row.checks label{gap:6px}
.row input[type=number]{width:74px}
.row input[type=text]{width:190px}
.row input[type=number],.row input[type=text]{background:rgba(0,0,0,.35);color:var(--ink);
  border:1px solid var(--panel-border);border-radius:7px;padding:6px 9px;font-family:var(--font);font-size:.76rem}
.row input[type=checkbox]{accent-color:#6fc9de;width:15px;height:15px}

button{margin-top:8px;margin-right:10px;background:linear-gradient(180deg,#2c7f96,#1d5f73);
  color:#eefaff;border:1px solid rgba(160,225,245,.3);border-radius:11px;padding:11px 24px;
  font-family:var(--font);font-size:.84rem;letter-spacing:.05em;cursor:pointer;transition:transform .15s ease,filter .15s ease}
button:hover{filter:brightness(1.12)}
button:active{transform:scale(.97)}
button.ghost{background:transparent;border-color:var(--panel-border);color:#9fb8c4}

.hud{position:fixed;inset:0;pointer-events:none;z-index:10}
#topbar{position:absolute;top:16px;left:16px;right:16px;display:flex;justify-content:space-between;gap:10px}
.pill{background:var(--panel);border:1px solid var(--panel-border);backdrop-filter:blur(8px);
  border-radius:11px;padding:7px 13px;font-size:.72rem;letter-spacing:.05em;color:#b8ccd6;
  font-variant-numeric:tabular-nums}

/* Fixation point, dead centre. Keeping the gaze parked here is what stops
   lateralised eye-movement artifact from contaminating the cue epoch. */
#fixation{position:absolute;left:50%;top:50%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;
  border-radius:50%;background:rgba(232,242,246,.5);box-shadow:0 0 6px rgba(232,242,246,.3)}

/* The side cue. Deliberately one colour for both sides: different hues mean
   different luminance, and that becomes a lateralised visual evoked potential
   the classifier can learn instead of motor imagery. */
#cue{position:absolute;left:50%;top:calc(50% - 86px);transform:translateX(-50%) translateY(-8px);
  opacity:0;transition:opacity .28s ease,transform .28s ease}
#cue.visible{opacity:1;transform:translateX(-50%) translateY(0)}
#cue-text{font-size:1.04rem;letter-spacing:.34em;color:#f2f8fb;
  text-shadow:0 1px 3px rgba(0,0,0,.95),0 2px 16px rgba(0,0,0,.85),0 0 30px rgba(0,0,0,.7)}

#phasebar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(255,255,255,.06)}
#phasebar-fill{height:100%;width:100%;transform-origin:left;transform:scaleX(0);
  background:linear-gradient(90deg,rgba(120,205,230,.5),rgba(160,225,245,.75))}

@media (max-width:620px){
  .card{padding:24px 20px}
  .card h1{font-size:1.5rem}
  .row input[type=text]{width:100%}
}
`;
