const canvas = new fabric.Canvas('c', { selection:false });

// ---- garment image (換商品/角度只需替換這個檔案) ----
// 原圖 800x800，實際內容（線稿本身）只佔中間 624x715 的範圍，四周有留白。
// 用 cropX/cropY/width/height 裁掉留白，再把裁切後的內容等比縮放滿版塞進 canvas，
// 讓「canvas 的座標範圍」跟「圖片內容的座標範圍」完全重合、沒有多餘留白——
// canvas 因此可以當成唯一的座標基準：只要之後在別的畫面用同一張圖、同一個
// canvas 寬高比例（480:550）去滿版繪製，任何 position_px/size_px 座標都能
// 原樣重現，不用另外換算圖片在畫布裡的偏移量。
const GARMENT_CONTENT = { cropX:81, cropY:38, width:624, height:715 };
fabric.Image.fromURL('assets/polo-shirt-eyes.png', (img) => {
  const scale = canvas.getWidth() / GARMENT_CONTENT.width;
  img.set({
    left:0, top:0,
    cropX:GARMENT_CONTENT.cropX, cropY:GARMENT_CONTENT.cropY,
    width:GARMENT_CONTENT.width, height:GARMENT_CONTENT.height,
    scaleX:scale, scaleY:scale,
    originX:'left', originY:'top', selectable:false, evented:false
  });
  canvas.add(img);
  canvas.sendToBack(img);
});

// ---- print-safe area, centered on torso, 避開領口鈕扣與下擺弧線 ----
// 座標單位一律是「畫布像素」，不做 cm 換算——cm 換算屬於後端根據
// 實體商品尺寸比對後才能決定的事，前端沒有校正基準，換算了也是假精度。
const AREA = { left:139, top:185, width:205, height:300 };

const areaRect = new fabric.Rect({
  left:AREA.left, top:AREA.top, width:AREA.width, height:AREA.height,
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
drawAreaMarkers();

canvas.renderAll();

// ---- responsive scaling ----
// 邏輯座標系統固定在 480x550（AREA、position_px 等都以此為準，輸出的
// canvas_px 也不會變），畫布在螢幕上顯示多大只是視覺縮放，用 setZoom
// 讓 Fabric 自動把滑鼠/觸控座標換算回邏輯座標，不用改任何互動邏輯。
const LOGICAL_W = canvas.getWidth();
const LOGICAL_H = canvas.getHeight();

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
