import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const scene = new THREE.Scene();
const container = document.querySelector(".container");
const camera = new THREE.PerspectiveCamera(
  75,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById("avatar-canvas"),
  alpha: true,
});
renderer.setSize(container.clientWidth, container.clientHeight);

// Add AR output canvas for final compositing
const arOutputCanvas = document.createElement("canvas");
arOutputCanvas.style.position = "absolute";
arOutputCanvas.style.top = "0";
arOutputCanvas.style.left = "0";
arOutputCanvas.style.width = "100%";
arOutputCanvas.style.height = "100%";
arOutputCanvas.style.zIndex = "10"; // Topmost
arOutputCanvas.id = "ar-output-canvas";
document.querySelector(".container").appendChild(arOutputCanvas);
const arOutputCtx = arOutputCanvas.getContext("2d");

// Handle window resize
window.addEventListener("resize", () => {
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
let spine = null;

let jawBone = null;
let leftEyeBone = null;
let rightEyeBone = null;

let leftWristBone = null;
let rightWristBone = null;

// Load GLB model
const loader = new GLTFLoader();
loader.load(
  "models/boy.glb",
  (gltf) => {
    const model = gltf.scene;
    model.scale.set(1.5, 1.5, 1.5);
    model.position.set(0, -1.5, 0);
    scene.add(model);

    // Find the bones
    model.traverse((obj) => {
      if (obj.isBone) {
        console.log(obj);
        if (obj.name.toLowerCase().includes("head_3")) {
          headBone = obj;
          console.log("Found head bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("leftshoulder_28")) {
          leftShoulderBone = obj;
          console.log("Found left shoulder bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("rightshoulder_52")) {
          rightShoulderBone = obj;
          console.log("Found right shoulder bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("leftarm_27")) {
          leftArmBone = obj;
          console.log("Found left Upper Arm bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("rightarm_51")) {
          rightArmBone = obj;
          console.log("Found right Upper Arm bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("spine1_54")) {
          spine = obj;
          console.log("Found Spine:", obj.name);
        } else if (obj.name.toLowerCase().includes("leftforearm_26")) {
          leftForearmBone = obj;
          console.log("Found left Fore Arm bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("rightforearm_50")) {
          rightForearmBone = obj;
          console.log("Found right fore arm bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("jaw")) {
          jawBone = obj;
          console.log("Found jaw bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("lefteye_1")) {
          leftEyeBone = obj;
          console.log("Found left eye bone:", obj.name);
        } else if (obj.name.toLowerCase().includes("righteye_2")) {
          rightEyeBone = obj;
          console.log("Found right eye bone:", obj.name);
        } else if (obj.name.toLowerCase().includes('lefthand_25')) {
          leftWristBone = obj;
        } else if (obj.name.toLowerCase().includes('righthand_49')) {
          rightWristBone = obj;
        }
      }
    });
  },
  undefined,
  (err) => {
    console.error("Error loading model:", err);
  }
);

// Camera position
camera.position.z = 2;

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

window.addEventListener("unifiedPoseUpdate", (event) => {
  // console.log('Unified pose update received:', event.detail);
  // console.log(leftForearmBone, rightForearmBone)
  // setTimeout(()=>{
  //   console.log("Waited");
  // },30000)
  const { head, shoulders, arms, forearms, torso, facial } = event.detail;

  // Head rotation
  if (headBone) {
    headBone.rotation.x = -head.x;
    headBone.rotation.y = -head.y;
    headBone.rotation.z = -head.z;
  }

  if (leftShoulderBone && rightShoulderBone) {
    leftShoulderBone.rotation.y = shoulders.left * 2;
    rightShoulderBone.rotation.y = shoulders.right * 2;
  }

  // this works just commenting for cleaner look

  if (spine) {
    spine.rotation.x = torso.x; // this goes for the front and back shift
    // spine.rotation.y = torso.y;
    spine.rotation.z = -torso.z; //this goes left and right
  }

  if (leftArmBone && rightArmBone) {
    leftArmBone.rotation.x = arms.left.x; // rotation on the left and right axis works
    rightArmBone.rotation.x = arms.right.x; // rotation on the left and right axis works
  }
  // --- Facial Animation using tasks-vision FaceLandmarker ---
  if (jawBone && facial) {
    // Prefer blendshapes if available for jaw open
    let jawOpenAmount = 0;
    if (facial.blendshapes && Array.isArray(facial.blendshapes.categories)) {
      // Find the blendshape for jawOpen (MediaPipe uses 'jawOpen' or similar)
      const jawOpen = facial.blendshapes.categories.find(
        (c) => c.categoryName && c.categoryName.toLowerCase().includes("jawopen")
      );
      if (jawOpen) {
        jawOpenAmount = Math.min(jawOpen.score * 1.2, 1.2); // scale for effect
      } else {
        // Fallback to mouthOpen distance
        const openThreshold = 0.02;
        jawOpenAmount = Math.min((facial.mouthOpen - openThreshold) * 15, 1.2);
      }
    } else {
      // Fallback to mouthOpen distance
      const openThreshold = 0.02;
      jawOpenAmount = Math.min((facial.mouthOpen - openThreshold) * 15, 1.2);
    }
    jawBone.rotation.x = -jawOpenAmount;
  }

  if (leftEyeBone && rightEyeBone && facial) {
    // Prefer blendshapes if available for eye blink
    let leftClosed = false;
    let rightClosed = false;
    if (facial.blendshapes && Array.isArray(facial.blendshapes.categories)) {
      const leftBlink = facial.blendshapes.categories.find(
        (c) => c.categoryName && c.categoryName.toLowerCase().includes("eyeBlinkLeft")
      );
      const rightBlink = facial.blendshapes.categories.find(
        (c) => c.categoryName && c.categoryName.toLowerCase().includes("eyeBlinkRight")
      );
      leftClosed = leftBlink ? leftBlink.score > 0.5 : false;
      rightClosed = rightBlink ? rightBlink.score > 0.5 : false;
    } else {
      // Fallback to eye openness
      const eyeThreshold = 0.004;
      leftClosed = facial.leftEyeOpen < eyeThreshold;
      rightClosed = facial.rightEyeOpen < eyeThreshold;
    }
    leftEyeBone.scale.y = leftClosed ? 0.2 : 1;
    rightEyeBone.scale.y = rightClosed ? 0.2 : 1;
  }

   // if (leftForearmBone && rightForearmBone) {
  //   leftForearmBone.rotation.x = forearms.left.x;
  //   leftForearmBone.rotation.y = forearms.left.y;
  //   leftForearmBone.rotation.z = forearms.left.z; // if required a negative would do the job

  //   rightForearmBone.rotation.x = forearms.right.x;
  //   rightForearmBone.rotation.y = forearms.right.y;
  //   rightForearmBone.rotation.z = forearms.right.z; // if required a negative would do the job

  //   console.log("forearms", forearms);
  // Optionally: Animate other facial features (eyebrows, mouth corners, etc.) using blendshapes
  // Example: Smile (mouth corners up)
  // if (facial && facial.blendshapes && Array.isArray(facial.blendshapes.categories)) {
  //   const smile = facial.blendshapes.categories.find(
  //     (c) => c.categoryName && c.categoryName.toLowerCase().includes("smile")
  //   );
  //   if (smile && leftMouthCornerBone && rightMouthCornerBone) {
  //     leftMouthCornerBone.position.y = smile.score * 0.1;
  //     rightMouthCornerBone.position.y = smile.score * 0.1;
  //   }
  // }
});

// Listen for wrist update and apply to 3D model
window.addEventListener('wristUpdate', (event) => {
  const { left, right } = event.detail;
  if (leftWristBone && left) {
    leftWristBone.position.x = left.x;
    leftWristBone.position.y = -left.y;
    leftWristBone.position.z = -left.z;
  }
  if (rightWristBone && right) {
    rightWristBone.position.x = right.x;
    rightWristBone.position.y = -right.y;
    rightWristBone.position.z = -right.z;
  }
});

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  compositeAROutput();
}
animate();

// Webcam access
const video = document.getElementById("webcam");
navigator.mediaDevices
  .getUserMedia({ video: true })
  .then((stream) => {
    video.srcObject = stream;
  })
  .catch((err) => {
    console.error("Webcam error:", err);
  });

// Composite AR output: video, 3D model, and segmentation mask
function compositeAROutput() {
  const video = document.getElementById("webcam");
  const maskCanvas = document.getElementById("mask-canvas");
  const threeJsCanvas = renderer.domElement;

  if (!video.videoWidth || !video.videoHeight) return;
  arOutputCanvas.width = video.videoWidth;
  arOutputCanvas.height = video.videoHeight;

  // 1. Draw the video as the background
  arOutputCtx.clearRect(0, 0, arOutputCanvas.width, arOutputCanvas.height);
  arOutputCtx.drawImage(
    video,
    0,
    0,
    arOutputCanvas.width,
    arOutputCanvas.height
  );

  // 2. Draw the 3D model everywhere
  arOutputCtx.drawImage(
    threeJsCanvas,
    0,
    0,
    arOutputCanvas.width,
    arOutputCanvas.height
  );

  // 3. Use the mask to ERASE the 3D model where the person is present
  if (maskCanvas && maskCanvas.width && maskCanvas.height) {
    arOutputCtx.save();
    arOutputCtx.globalCompositeOperation = "destination-out";
    arOutputCtx.drawImage(
      maskCanvas,
      0,
      0,
      arOutputCanvas.width,
      arOutputCanvas.height
    );
    arOutputCtx.restore();

    // (Optional) Draw the video again where the mask is present for perfect edges
    arOutputCtx.save();
    arOutputCtx.globalCompositeOperation = "destination-atop";
    arOutputCtx.drawImage(
      video,
      0,
      0,
      arOutputCanvas.width,
      arOutputCanvas.height
    );
    arOutputCtx.restore();
  }
}

// Hide the Three.js, mask, and debug canvases so only the AR output is visible
const threeJsCanvas = renderer.domElement;
threeJsCanvas.style.display = "none";
const maskCanvas = document.getElementById("mask-canvas");
if (maskCanvas) maskCanvas.style.display = "none";
const debugCanvas = document.getElementById("debug-canvas");
if (debugCanvas) debugCanvas.style.display = "none";
