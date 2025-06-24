import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const scene = new THREE.Scene();
const container = document.querySelector('.container');
const camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('avatar-canvas'), alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);

// Add AR output canvas for final compositing
const arOutputCanvas = document.createElement('canvas');
arOutputCanvas.style.position = 'absolute';
arOutputCanvas.style.top = '0';
arOutputCanvas.style.left = '0';
arOutputCanvas.style.width = '100%';
arOutputCanvas.style.height = '100%';
arOutputCanvas.style.zIndex = '10'; // Topmost
arOutputCanvas.id = 'ar-output-canvas';
document.querySelector('.container').appendChild(arOutputCanvas);
const arOutputCtx = arOutputCanvas.getContext('2d');

// Handle window resize
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  // Update camera
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  
  // Update renderer
  renderer.setSize(width, height);
});

// Light
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const light = new THREE.DirectionalLight(0xffffff, 0.8);
light.position.set(1, 1, 1);
scene.add(light);


// bones

let headBone = null;
let leftShoulderBone = null;
let rightShoulderBone = null;
let leftArmBone = null;
let rightArmBone = null;
let leftForearmBone = null;
let rightForearmBone = null;
let leftThighBone = null;
let rightThighBone = null;
let leftwrist = null;
let rightwrist = null;
let spine = null;

// Load GLB model
const loader = new GLTFLoader();
loader.load('models/humanoid.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5);
  model.position.set(0, -1.5, 0);
  scene.add(model);

  // Find the bones
  model.traverse((obj) => {

    if (obj.isBone) {
      console.log(obj)
      if (obj.name.toLowerCase().includes('head_3')) {
        headBone = obj;
        console.log("Found head bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('leftshoulder_28')) {
        leftShoulderBone = obj;
        console.log("Found left shoulder bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('rightshoulder_52')) {
        rightShoulderBone = obj;
        console.log("Found right shoulder bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('leftarm_27')) {
        leftArmBone = obj;
        console.log("Found left Upper Arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('rightarm_51')) {
        rightArmBone = obj;
        console.log("Found right Upper Arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('spine1_54')) {
        spine = obj;
        console.log("Found Spine:", obj.name);
      } else if (obj.name.toLowerCase().includes('leftforearm_26')) {
        leftForearmBone = obj;
        console.log("Found left Fore Arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('rightforearm_50')) {
        rightForearmBone = obj;
        console.log("Found right fore arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('leftupleg_60')) {
        leftThighBone = obj;
        console.log("Found left Fore thigh bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('rightupleg_65')) {
        rightThighBone = obj;
        console.log("Found right fore thigh bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('lefthand_25')) {
        leftwrist = obj;
        console.log("Found left left wrist bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('righthand_49')) {
        rightwrist = obj;
        console.log("Found right right wrist bone:", obj.name);
      }
      
    }
  });

}, undefined, (err) => {
  console.error('Error loading model:', err);
});

// Camera position
camera.position.z = 2;

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

window.addEventListener('unifiedPoseUpdate', (event) => {
  const { head, shoulders, arms, forearms, torso, thighs, wrist } = event.detail;

    
  if (headBone) {
    headBone.rotation.x = -head.x;
    headBone.rotation.y = -head.y;
    headBone.rotation.z = -head.z;
  }

  if (leftShoulderBone && rightShoulderBone) {
    leftShoulderBone.rotation.y = shoulders.left * 2;
    rightShoulderBone.rotation.y = shoulders.right * 2 ;
  }

  // this works just commenting for cleaner look

  if (spine) {

    spine.rotation.x = torso.x; // this goes for the front and back shift
    // spine.rotation.y = torso.y;
    spine.rotation.z = -torso.z; //this goes left and right
  }

  if(leftArmBone && rightArmBone) {
    leftArmBone.rotation.x = arms.left.x; // rotation on the left and right axis works
  //   //leftArmBone.rotation.y = arms.left.y;
  //   //leftArmBone.rotation.z = -arms.left.z;

    rightArmBone.rotation.x = arms.right.x; // rotation on the left and right axis works
  //   //rightArmBone.rotation.y = arms.right.y;
  //   //rightArmBone.rotation.z = -arms.right.z;
   }

  if ( leftForearmBone && rightForearmBone ) {
    
  leftForearmBone.rotation.x = forearms.left.x; // works but I generall am not a big fan of it, this moves in the left and right axis only. I think a clamp maybe would make this a bit more powerful than what it is right now :)
  //   // leftForearmBone.rotation.y = forearms.left.y; // half baked but decent. But also when I do the trial run I cant see anything that is useful from it so I am wondering if it is any useful at all
  leftForearmBone.rotation.z = -forearms.left.z; // if required a negative would do the job, something is working the front and back going arms are all working and I am here wondering what the hell how is this possible

    
 rightForearmBone.rotation.x= forearms.right.x; // works but I generall am not a big fan of it, this moves in the left and right axis only. I think a clamp maybe would make this a bit more powerful than what it is right now :)
  //    // rightForearmBone.rotation.y = forearms.right.y; // But also when I do the trial run I cant see anything that is useful from it so I am wondering if it is any useful at all
  rightForearmBone.rotation.z = -forearms.right.z; // if required a negative would do the job, something is working the front and back going arms are all working and I am here wondering what the hell how is this possible

  //   console.log("forearms", forearms)
   }

  if ( leftwrist && rightwrist ) {
    // Apply wrist rotations (pitch, yaw, roll)
    leftwrist.rotation.x = wrist.left.x;
     //leftwrist.rotation.y = wrist.left.y;
     leftwrist.rotation.z = -wrist.left.z;

    //rightwrist.rotation.x = wrist.right.x;
     rightwrist.rotation.y = wrist.right.y;
     rightwrist.rotation.z = -wrist.right.z;
  }

  // if (leftThighBone && rightThighBone) {

  //   console.log("thigs", thighs);
  //   console.log("bones", leftThighBone, rightThighBone);

  //   leftThighBone.rotation.x = thighs.left.x;
  //   // leftThighBone.rotation.y = thighs.left.y;
  //   // leftThighBone.rotation.z = thighs.left.z;


  //   rightThighBone.rotation.x = thighs.right.x;
  //   // rightThighBone.rotation.y = thighs.right.y;
  //   // rightThighBone.rotation.z = thighs.right.z;
  // }

});

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  compositeAROutput();
}
animate();

// Webcam access
const video = document.getElementById('webcam');
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  video.srcObject = stream;
}).catch((err) => {
  console.error("Webcam error:", err);
});

// Composite AR output: video, 3D model, and segmentation mask
function compositeAROutput() {
  const video = document.getElementById('webcam');
  const maskCanvas = document.getElementById('mask-canvas');
  const threeJsCanvas = renderer.domElement;

  if (!video.videoWidth || !video.videoHeight) return;
  arOutputCanvas.width = video.videoWidth;
  arOutputCanvas.height = video.videoHeight;

  // 1. Draw the video as the background
  arOutputCtx.clearRect(0, 0, arOutputCanvas.width, arOutputCanvas.height);
  arOutputCtx.drawImage(video, 0, 0, arOutputCanvas.width, arOutputCanvas.height);

  // 2. Draw the 3D model everywhere
  arOutputCtx.drawImage(threeJsCanvas, 0, 0, arOutputCanvas.width, arOutputCanvas.height);

  // 3. Use the mask to ERASE the 3D model where the person is present
  if (maskCanvas && maskCanvas.width && maskCanvas.height) {
    arOutputCtx.save();
    arOutputCtx.globalCompositeOperation = 'destination-out';
    arOutputCtx.drawImage(maskCanvas, 0, 0, arOutputCanvas.width, arOutputCanvas.height);
    arOutputCtx.restore();

    // (Optional) Draw the video again where the mask is present for perfect edges
    arOutputCtx.save();
    arOutputCtx.globalCompositeOperation = 'destination-atop';
    arOutputCtx.drawImage(video, 0, 0, arOutputCanvas.width, arOutputCanvas.height);
    arOutputCtx.restore();
  }
}

// Hide the Three.js, mask, and debug canvases so only the AR output is visible
const threeJsCanvas = renderer.domElement;
threeJsCanvas.style.display = 'none';
const maskCanvas = document.getElementById('mask-canvas');
if (maskCanvas) maskCanvas.style.display = 'none';
const debugCanvas = document.getElementById('debug-canvas');
if (debugCanvas) debugCanvas.style.display = 'none';