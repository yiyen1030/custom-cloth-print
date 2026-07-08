const canvas = new fabric.Canvas('c', { selection:false });
const BASE_CANVAS_WIDTH = canvas.getWidth(); // 480，跟版面設計搭配的寬度基準；高度依商品圖比例自動決定

// ---- print-safe area ----
// 座標單位一律是「畫布像素」，不做 cm 換算——cm 換算屬於後端根據
// 實體商品尺寸比對後才能決定的事，前端沒有校正基準，換算了也是假精度。
// 初始值先是 0，等圖片載入、量出實際 canvas 尺寸後，由 setAreaDefaults() 填入。
const AREA = { left:0, top:0, width:0, height:0 };

const areaRect = new fabric.Rect({
  left:0, top:0, width:0, height:0,
  fill:'rgba(193,68,14,0.03)',
  stroke:'#C1440E',
  strokeDashArray:[6,4],
  strokeWidth:1.5,
  selectable:false, evented:false, rx:2, ry:2,
  cornerColor:'#C1440E', cornerStrokeColor:'#221F1A',
  cornerSize:12, touchCornerSize:28, transparentCorners:false,
  borderColor:'#C1440E'
});
canvas.add(areaRect);

// corner notches (tailor pattern marks) + label，AREA 改動後可用 drawAreaMarkers() 重繪
let areaMarkers = [];
function notch(x,y,dx,dy){
  return new fabric.Line([x,y,x+dx,y+dy], { stroke:'#C1440E', strokeWidth:2, selectable:false, evented:false });
}
function drawAreaMarkers(){
  areaMarkers.forEach(o => canvas.remove(o));
  areaMarkers = [];
  [[AREA.left,AREA.top,10,0],[AREA.left,AREA.top,0,10],
   [AREA.left+AREA.width,AREA.top,-10,0],[AREA.left+AREA.width,AREA.top,0,10],
   [AREA.left,AREA.top+AREA.height,10,0],[AREA.left,AREA.top+AREA.height,0,-10],
   [AREA.left+AREA.width,AREA.top+AREA.height,-10,0],[AREA.left+AREA.width,AREA.top+AREA.height,0,-10]
  ].forEach(a=>{ const n = notch(...a); areaMarkers.push(n); canvas.add(n); });

  const label = new fabric.Text('可印刷範圍', {
    left:AREA.left, top:AREA.top-20, fontSize:11, fill:'#C1440E',
    fontFamily:"'JetBrains Mono', monospace", selectable:false, evented:false
  });
  areaMarkers.push(label);
  canvas.add(label);
}

// AREA 的預設起始位置用「畫布比例」推算（水平置中、寬度抓畫布 45%、上緣約
// 畫布 32% 處開始），只是一個看起來合理的起點——實際要避開鈕扣/下擺這類
// 商品細節，本來就無法自動判斷（純像素分析看不懂「這是鈕扣」），這部分
// 還是要靠下面「後台可印刷範圍編輯模式」讓人手動微調一次。
function setAreaDefaults(){
  const w = canvas.getWidth(), h = canvas.getHeight();
  AREA.width = Math.round(w * 0.45);
  AREA.height = Math.round(h * 0.5);
  AREA.left = Math.round((w - AREA.width) / 2);
  AREA.top = Math.round(h * 0.32);
  areaRect.set({ left:AREA.left, top:AREA.top, width:AREA.width, height:AREA.height, scaleX:1, scaleY:1 });
}

// ---- garment image：自動偵測內容邊界、滿版對齊 canvas ----
// 換掉 assets 底下的圖檔、重新整理頁面，就會自動抓新圖的實際內容邊界
// （排除四周留白），並依內容比例調整 canvas 高度去滿版鋪滿，不需要手動
// 重新計算、修改程式碼裡的裁切常數（這是之前的做法，見 git 歷史）。
// 原理：把圖片畫到一個暫時的畫布上，用 getImageData() 掃描像素，找出
// 「不是透明、也不接近全白背景」的像素分佈範圍，當作實際內容的邊界。
function detectContentBBox(imgEl){
  const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(imgEl, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX=w, minY=h, maxX=0, maxY=0, found=false;
  for(let y=0; y<h; y++){
    for(let x=0; x<w; x++){
      const i = (y*w+x)*4;
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      if(a>10 && !(r>245 && g>245 && b>245)){
        found = true;
        if(x<minX) minX=x;
        if(x>maxX) maxX=x;
        if(y<minY) minY=y;
        if(y>maxY) maxY=y;
      }
    }
  }
  if(!found) return { cropX:0, cropY:0, width:w, height:h }; // 整張都接近全白，保底不裁切
  return { cropX:minX, cropY:minY, width:(maxX-minX)||1, height:(maxY-minY)||1 };
}

const GARMENT_IMAGE_URL = 'assets/polo-shirt-eyes.png';
const rawGarmentImg = new Image();
rawGarmentImg.crossOrigin = 'anonymous';
rawGarmentImg.onload = () => {
  const content = detectContentBBox(rawGarmentImg);
  const canvasHeight = Math.round(BASE_CANVAS_WIDTH * (content.height / content.width));
  canvas.setDimensions({ width: BASE_CANVAS_WIDTH, height: canvasHeight });
  LOGICAL_W = canvas.getWidth();
  LOGICAL_H = canvas.getHeight();
  document.getElementById('canvasSpecTag').textContent = LOGICAL_W + ' × ' + LOGICAL_H;

  const garmentImg = new fabric.Image(rawGarmentImg, {
    left:0, top:0,
    cropX:content.cropX, cropY:content.cropY,
    width:content.width, height:content.height,
    scaleX: BASE_CANVAS_WIDTH / content.width,
    scaleY: BASE_CANVAS_WIDTH / content.width,
    originX:'left', originY:'top', selectable:false, evented:false
  });
  canvas.add(garmentImg);
  canvas.sendToBack(garmentImg);

  setAreaDefaults();
  drawAreaMarkers();
  updateAreaSpecTag();
  fitCanvasToContainer();
  canvas.renderAll();
};
rawGarmentImg.src = GARMENT_IMAGE_URL;

canvas.renderAll();

// ---- responsive scaling ----
// 邏輯座標系統以目前 canvas 尺寸為準（AREA、position_px 等都以此為準，
// 輸出的 canvas_px 也不會變），畫布在螢幕上顯示多大只是視覺縮放，用
// setZoom 讓 Fabric 自動把滑鼠/觸控座標換算回邏輯座標，不用改互動邏輯。
// 圖片載入完成時（見上方 onload）會重新賦值成實際偵測出的尺寸。
let LOGICAL_W = canvas.getWidth();
let LOGICAL_H = canvas.getHeight();

function fitCanvasToContainer(){
  const stage = document.querySelector('.stage');
  const holder = document.querySelector('.canvas-holder');
  const stageStyle = getComputedStyle(stage);
  const holderStyle = getComputedStyle(holder);
  const stagePad = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight);
  const holderPad = parseFloat(holderStyle.paddingLeft) + parseFloat(holderStyle.paddingRight);
  const available = stage.clientWidth - stagePad - holderPad;
  const scale = Math.min(1, available / LOGICAL_W);
  canvas.setDimensions({ width: LOGICAL_W * scale, height: LOGICAL_H * scale });
  canvas.setZoom(scale);
  canvas.renderAll();
}

window.addEventListener('resize', fitCanvasToContainer);
fitCanvasToContainer();

// ---- upload logic ----
let logo = null;
const fileInput = document.getElementById('fileInput');
const uploadBox = document.getElementById('uploadBox');
const statusTxt = document.getElementById('statusTxt');
const resetBtn = document.getElementById('resetBtn');
const centerBtn = document.getElementById('centerBtn');
const exportBtn = document.getElementById('exportBtn');
const jsonOut = document.getElementById('jsonOut');

fileInput.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=> addLogo(ev.target.result, file.name);
  reader.readAsDataURL(file);
});

function addLogo(dataUrl, filename){
  if(logo){ canvas.remove(logo); }
  fabric.Image.fromURL(dataUrl, (img)=>{
    const maxDim = Math.min(AREA.width, AREA.height) * 0.7;
    const scale = maxDim / Math.max(img.width, img.height);
    img.set({
      left: AREA.left + AREA.width/2,
      top: AREA.top + AREA.height/2,
      originX:'center', originY:'center',
      scaleX:scale, scaleY:scale,
      cornerColor:'#C1440E', cornerStrokeColor:'#221F1A',
      cornerSize:12, touchCornerSize:28, transparentCorners:false,
      borderColor:'#C1440E'
    });
    img.name = filename;
    logo = img;
    canvas.add(logo);
    canvas.setActiveObject(logo);
    constrainToArea(logo);
    canvas.renderAll();
    statusTxt.textContent = filename;
    resetBtn.disabled = false;
    centerBtn.disabled = false;
    exportBtn.disabled = false;
    updateSpec();
  }, { crossOrigin:'anonymous' });
}

function constrainToArea(obj){
  obj.setCoords();
  const b = obj.getBoundingRect(true);
  let dx = 0, dy = 0;
  if(b.left < AREA.left) dx = AREA.left - b.left;
  if(b.top < AREA.top) dy = AREA.top - b.top;
  if(b.left + b.width > AREA.left + AREA.width) dx = (AREA.left+AREA.width) - (b.left+b.width);
  if(b.top + b.height > AREA.top + AREA.height) dy = (AREA.top+AREA.height) - (b.top+b.height);
  if(dx !== 0) obj.left += dx;
  if(dy !== 0) obj.top += dy;
  obj.setCoords();
}

function constrainToCanvas(obj){
  obj.setCoords();
  const b = obj.getBoundingRect(true);
  let dx = 0, dy = 0;
  if(b.left < 0) dx = -b.left;
  if(b.top < 0) dy = -b.top;
  if(b.left + b.width > LOGICAL_W) dx = LOGICAL_W - (b.left + b.width);
  if(b.top + b.height > LOGICAL_H) dy = LOGICAL_H - (b.top + b.height);
  if(dx !== 0) obj.left += dx;
  if(dy !== 0) obj.top += dy;
  obj.setCoords();
}

canvas.on('object:moving', (e)=>{
  if(editingArea && e.target === areaRect){ constrainToCanvas(areaRect); updateAreaEditSpec(); return; }
  constrainToArea(e.target); updateSpec();
});
canvas.on('object:scaling', (e)=>{
  if(editingArea && e.target === areaRect){ constrainToCanvas(areaRect); updateAreaEditSpec(); return; }
  constrainToArea(e.target); updateSpec();
});
canvas.on('object:rotating', (e)=>{ updateSpec(); });
canvas.on('object:modified', (e)=>{
  if(editingArea && e.target === areaRect) return;
  updateSpec();
});

function updateSpec(){
  if(!logo){
    ['specX','specY','specW','specH','specR'].forEach(id=>document.getElementById(id).textContent='—');
    return;
  }
  logo.setCoords();
  const b = logo.getBoundingRect(true);
  const xPx = Math.round(b.left - AREA.left);
  const yPx = Math.round(b.top - AREA.top);
  const wPx = Math.round(b.width);
  const hPx = Math.round(b.height);
  const rot = Math.round(logo.angle % 360);
  document.getElementById('specX').textContent = xPx + ' px';
  document.getElementById('specY').textContent = yPx + ' px';
  document.getElementById('specW').textContent = wPx + ' px';
  document.getElementById('specH').textContent = hPx + ' px';
  document.getElementById('specR').textContent = rot + '°';
  jsonOut.classList.remove('show');
}

resetBtn.addEventListener('click', ()=>{
  if(logo){ canvas.remove(logo); logo = null; }
  fileInput.value = '';
  statusTxt.textContent = '尚未上傳圖案';
  resetBtn.disabled = true;
  centerBtn.disabled = true;
  exportBtn.disabled = true;
  jsonOut.classList.remove('show');
  updateSpec();
  canvas.renderAll();
});

centerBtn.addEventListener('click', ()=>{
  if(!logo) return;
  logo.set({ left:AREA.left+AREA.width/2, top:AREA.top+AREA.height/2 });
  logo.setCoords();
  canvas.renderAll();
  updateSpec();
});

exportBtn.addEventListener('click', ()=>{
  if(!logo) return;
  logo.setCoords();
  const b = logo.getBoundingRect(true);
  const payload = {
    order_ref: "demo-" + Date.now(),
    garment: "tshirt",
    view: "front",
    canvas_px: { width: canvas.getWidth(), height: canvas.getHeight() },
    print_area_px: { left: AREA.left, top: AREA.top, width: AREA.width, height: AREA.height },
    design: {
      filename: logo.name || "uploaded-image.png",
      position_px: {
        x: Math.round(b.left - AREA.left),
        y: Math.round(b.top - AREA.top)
      },
      size_px: {
        width: Math.round(b.width),
        height: Math.round(b.height)
      },
      rotation_deg: Math.round(logo.angle % 360)
    }
  };
  jsonOut.textContent = JSON.stringify(payload, null, 2);
  jsonOut.classList.add('show');
});

updateSpec();

// ---- 後台：可印刷範圍編輯模式（模擬管理端調整，尚未接後端，僅在此頁面即時生效） ----
const editAreaBtn = document.getElementById('editAreaBtn');
const areaEditPanel = document.getElementById('areaEditPanel');
const saveAreaBtn = document.getElementById('saveAreaBtn');
const cancelAreaBtn = document.getElementById('cancelAreaBtn');
const areaJsonOut = document.getElementById('areaJsonOut');
const areaSpecTag = document.getElementById('areaSpecTag');
const uploadControlsRow = document.getElementById('uploadControlsRow');

let editingArea = false;
let areaBackup = null;

function updateAreaSpecTag(){
  areaSpecTag.textContent = AREA.width + ' × ' + AREA.height;
}
updateAreaSpecTag();

function updateAreaEditSpec(){
  areaRect.setCoords();
  const b = areaRect.getBoundingRect(true);
  document.getElementById('areaSpecX').textContent = Math.round(b.left) + ' px';
  document.getElementById('areaSpecY').textContent = Math.round(b.top) + ' px';
  document.getElementById('areaSpecW').textContent = Math.round(b.width) + ' px';
  document.getElementById('areaSpecH').textContent = Math.round(b.height) + ' px';
}

function exitAreaEditMode(){
  editingArea = false;
  areaRect.set({ selectable:false, evented:false, fill:'rgba(193,68,14,0.03)' });
  canvas.discardActiveObject();
  if(logo){ logo.selectable = true; logo.evented = true; }
  uploadControlsRow.classList.remove('is-disabled');
  uploadBox.classList.remove('is-disabled');
  fileInput.disabled = false;
  editAreaBtn.style.display = '';
  areaEditPanel.style.display = 'none';
  canvas.renderAll();
}

editAreaBtn.addEventListener('click', ()=>{
  editingArea = true;
  areaBackup = { left:AREA.left, top:AREA.top, width:AREA.width, height:AREA.height };

  if(logo){ logo.selectable = false; logo.evented = false; }
  canvas.discardActiveObject();
  uploadControlsRow.classList.add('is-disabled');
  uploadBox.classList.add('is-disabled');
  fileInput.disabled = true;

  areaMarkers.forEach(o => canvas.remove(o));
  areaMarkers = [];

  areaRect.set({
    selectable:true, evented:true, hasControls:true, hasBorders:true,
    lockRotation:true, fill:'rgba(193,68,14,0.15)'
  });
  canvas.setActiveObject(areaRect);
  canvas.renderAll();

  editAreaBtn.style.display = 'none';
  areaEditPanel.style.display = 'block';
  areaJsonOut.classList.remove('show');
  updateAreaEditSpec();
});

saveAreaBtn.addEventListener('click', ()=>{
  areaRect.setCoords();
  const b = areaRect.getBoundingRect(true);
  AREA.left = Math.round(b.left);
  AREA.top = Math.round(b.top);
  AREA.width = Math.round(b.width);
  AREA.height = Math.round(b.height);

  areaRect.set({
    left:AREA.left, top:AREA.top, width:AREA.width, height:AREA.height,
    scaleX:1, scaleY:1
  });

  exitAreaEditMode();
  drawAreaMarkers();
  updateAreaSpecTag();

  if(logo){ constrainToArea(logo); updateSpec(); }

  areaJsonOut.textContent = JSON.stringify({ print_area_px: { left:AREA.left, top:AREA.top, width:AREA.width, height:AREA.height } }, null, 2);
  areaJsonOut.classList.add('show');
  canvas.renderAll();
});

cancelAreaBtn.addEventListener('click', ()=>{
  areaRect.set({
    left:areaBackup.left, top:areaBackup.top,
    width:areaBackup.width, height:areaBackup.height,
    scaleX:1, scaleY:1
  });
  exitAreaEditMode();
  drawAreaMarkers();
  canvas.renderAll();
});
