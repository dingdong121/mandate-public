import { loginPage } from './login-page';

// CSS-only concept: source logo remains unchanged and current /login is preserved.
const theme = `<style id="arc-palette-preview">
:root{color-scheme:light}body{background:#e2f3ff;color:#24235b}header{border-bottom-color:#c2dbea;background:#eff8ff99}.badge{color:#575578;border-color:#bac7df;background:#ffffff66}.logo{color:#24235b}.logo:hover{color:#853b69}.logo:focus-visible{outline-color:#6651a4}.logo-icon{background:#24235b;border-radius:13px}.logo-icon img{filter:grayscale(1);mix-blend-mode:screen}.brand h1{color:#25235b}.brand h1 span{color:#85436c}.eyebrow{color:#5e5095}.brand p,.subtitle{color:#5b637c}.steps{border-top-color:#b9d1e4}.steps span{color:#5b637c}main{background:#f8fcff;border-color:#c8dcec;box-shadow:0 24px 64px #39336a12}input{background:#fff;color:#25235b;border-color:#c2cbe0}input::placeholder{color:#9198ae}input:focus-visible{border-color:#6651a4;box-shadow:0 0 0 3px #6651a415}button{background:#35316e;color:#fff}button:hover:not(:disabled){background:#53417e}button:focus-visible{outline-color:#6651a4}.secondary{background:none;color:#66518d}.secondary:hover:not(:disabled){background:none;color:#853b69}#status{color:#585879}.foot{color:#737b91;border-top-color:#d0deeb}
</style>`;

export const arcThemePreview = loginPage.replace('</head>', theme + '</head>');
