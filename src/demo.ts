/**
 * A synthetic "old photograph" and an "AI restoration" of it.
 *
 * The truth: a bakery founded in 1952. The old photo is that scene at
 * 320 × 240, blurred, sepia and grainy. The restoration is 1280 × 960 and
 * colourized. It adds brick texture and a face that the photo cannot show,
 * reads the sign as "1958" (the blurred digits allow it), and adds a round
 * window that the photo clearly does not have. Everything is invented.
 */

const W = 1280;
const H = 960;

type Variant = 'truth' | 'restoration';

function drawScene(ctx: CanvasRenderingContext2D, variant: Variant) {
  const ai = variant === 'restoration';
  // Neighbouring buildings fill the frame behind everything else.
  ctx.fillStyle = ai ? '#c9b8a6' : '#a9a29a';
  ctx.fillRect(0, 0, W, H);
  // Sky.
  const sky = ctx.createLinearGradient(0, 0, 0, 300);
  sky.addColorStop(0, ai ? '#8fb8de' : '#b8c4cc');
  sky.addColorStop(1, ai ? '#d6e6f2' : '#dfe3e5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 300);

  // Building facade.
  ctx.fillStyle = ai ? '#b5654a' : '#9b7764';
  ctx.fillRect(140, 150, 1000, 700);
  // Roof line.
  ctx.fillStyle = ai ? '#5b3a2e' : '#594a42';
  ctx.fillRect(120, 130, 1040, 40);

  if (ai) {
    // Invented: crisp brick courses that a 320 px photo cannot resolve.
    ctx.strokeStyle = 'rgba(240, 220, 200, 0.55)';
    ctx.lineWidth = 2;
    for (let y = 180; y < 850; y += 14) {
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(1140, y);
      ctx.stroke();
      for (let x = 140 + ((y / 14) % 2) * 20; x < 1140; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 14);
        ctx.stroke();
      }
    }
    // Contradicted: a round window where the photo shows plain wall.
    ctx.fillStyle = '#1d2b3a';
    ctx.beginPath();
    ctx.arc(1010, 255, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#efe6d8';
    ctx.lineWidth = 12;
    ctx.stroke();
  }

  // Sign board.
  ctx.fillStyle = ai ? '#22313f' : '#3a3633';
  ctx.fillRect(330, 200, 620, 120);
  ctx.fillStyle = ai ? '#f3d27a' : '#e9e2d6';
  ctx.font = '700 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BAKERY', 640, 246);
  ctx.font = '600 28px Georgia, serif';
  ctx.fillText(ai ? 'EST. 1958' : 'EST. 1952', 640, 295);

  // Shop window with muntins.
  ctx.fillStyle = ai ? '#2c3e50' : '#3d3d3d';
  ctx.fillRect(220, 420, 420, 300);
  ctx.fillStyle = ai ? '#d9e8f0' : '#c9c9c4';
  ctx.fillRect(236, 436, 388, 268);
  ctx.fillStyle = ai ? '#2c3e50' : '#3d3d3d';
  ctx.fillRect(424, 436, 12, 268);
  ctx.fillRect(236, 564, 388, 12);
  if (ai) {
    // Enhanced: reflections on glass the photo does show.
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 6;
    for (const x of [270, 300, 470, 500]) {
      ctx.beginPath();
      ctx.moveTo(x, 450);
      ctx.lineTo(x - 30, 540);
      ctx.stroke();
    }
  }

  // Awning.
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? (ai ? '#f4efe6' : '#d8d4cc') : ai ? '#2e7d5b' : '#5d5d58';
    ctx.fillRect(200 + i * 46, 370, 46, 46);
  }

  // Door and a person in the doorway.
  ctx.fillStyle = ai ? '#3e2723' : '#3b302b';
  ctx.fillRect(760, 470, 220, 380);
  ctx.fillStyle = ai ? '#1f4e79' : '#55524f';
  ctx.fillRect(810, 600, 120, 250);
  ctx.fillStyle = ai ? '#e8b896' : '#a59a90';
  ctx.beginPath();
  ctx.arc(870, 555, 46, 0, Math.PI * 2);
  ctx.fill();
  if (ai) {
    // Invented: a face. The photo has a featureless blur here.
    ctx.fillStyle = '#3b2a20';
    ctx.beginPath();
    ctx.arc(853, 548, 5, 0, Math.PI * 2);
    ctx.arc(887, 548, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a3e2e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(870, 570, 14, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#4a2c1d';
    ctx.beginPath();
    ctx.arc(870, 530, 46, Math.PI, 0);
    ctx.fill();
  }

  // Pavement.
  ctx.fillStyle = ai ? '#9e9e9e' : '#8f8b86';
  ctx.fillRect(0, 850, W, 110);
  ctx.fillStyle = ai ? '#757575' : '#7c7873';
  for (let x = 0; x < W; x += 160) ctx.fillRect(x, 850, 4, 110);
}

export interface DemoPair {
  source: HTMLCanvasElement;
  restoration: HTMLCanvasElement;
}

export function demoPair(): DemoPair {
  // The old photograph: the truth, small, soft, sepia and grainy.
  const big = document.createElement('canvas');
  big.width = W;
  big.height = H;
  drawScene(big.getContext('2d')!, 'truth');
  const source = document.createElement('canvas');
  source.width = 320;
  source.height = 240;
  const sctx = source.getContext('2d', { willReadFrequently: true })!;
  sctx.filter = 'blur(0.8px)';
  sctx.drawImage(big, 0, 0, 320, 240);
  sctx.filter = 'none';
  const image = sctx.getImageData(0, 0, 320, 240);
  let seed = 3;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const grain = ((seed / 2 ** 32) * 2 - 1) * 6;
    const v = 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2] + grain;
    image.data[i] = v * 1.07 + 6;
    image.data[i + 1] = v * 0.96 + 4;
    image.data[i + 2] = v * 0.8;
  }
  sctx.putImageData(image, 0, 0);

  const restoration = document.createElement('canvas');
  restoration.width = W;
  restoration.height = H;
  drawScene(restoration.getContext('2d')!, 'restoration');
  return { source, restoration };
}
