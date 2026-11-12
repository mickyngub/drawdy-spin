import { MAX_PHOTO } from "../../src/lib/entries";

const SIZE = 64;
const QUALITIES = [0.82, 0.7, 0.58, 0.46, 0.34];

function load(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("unreadable image"));
        };
        img.src = url;
    });
}

/** The centre square of a picture as a 64 px JPEG small enough for a wheel to carry twenty. */
export async function squarePhoto(file: File): Promise<string | null> {
    let img: HTMLImageElement;
    try {
        img = await load(file);
    } catch {
        return null;
    }
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) return null;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(
        img,
        (img.naturalWidth - side) / 2,
        (img.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        SIZE,
        SIZE
    );
    for (const quality of QUALITIES) {
        const url = canvas.toDataURL("image/jpeg", quality);
        if (url.length <= MAX_PHOTO) return url;
    }
    return null;
}
