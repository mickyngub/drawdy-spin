// The overlay is a canvas, so its page needs only resets; color-scheme matches the host's so the iframe stays transparent.
export function overlayHtml(js: string): string {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="__SPIN_SCHEME__" />
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%;height:100%}</style>
</head>
<body>
<canvas id="spin" aria-hidden="true"></canvas>
<script type="application/json" id="spin-config">__SPIN_CONFIG__</script>
<script>${js}</script>
</body>
</html>`;
}
