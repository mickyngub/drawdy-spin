/** The page drawn inside each wheel widget; the driver fills `__SPIN_STATE__` with the wheel's meta. */
export function faceHtml(js: string, css: string): string {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="color-scheme" content="light dark" />
<style>${css}</style>
</head>
<body class="m-0 h-screen overflow-hidden bg-paper select-none">
<canvas id="wheel" role="img" aria-label="Spin wheel" class="block size-full"></canvas>
<i id="probe" hidden></i>
<script type="application/json" id="spin">__SPIN_STATE__</script>
<script>${js}</script>
</body>
</html>`;
}
