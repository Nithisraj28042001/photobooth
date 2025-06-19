import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const scene = new THREE.Scene();
const container = document.querySelector('.container');
const camera = new THREE.PerspectiveCamera(75, container.clientWidth/container.clientHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('avatar-canvas'), alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);

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
let spine = null;

// Load GLB model
const loader = new GLTFLoader();
loader.load('models/demo.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.set(1.5, 1.5, 1.5);
  model.position.set(0, -1.5, 0);
  scene.add(model);

  // Find the bones
  model.traverse((obj) => {
    if (obj.isBone) {
      if (obj.name.toLowerCase().includes('head')) {
        headBone = obj;
        console.log("Found head bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('shoulderl')) {
        leftShoulderBone = obj;
        console.log("Found left shoulder bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('shoulderr')) {
        rightShoulderBone = obj;
        console.log("Found right shoulder bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('upper_arml')) {
        leftArmBone = obj;
        console.log("Found left Upper Arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('upper_armr')) {
        rightArmBone = obj;
        console.log("Found right Upper Arm bone:", obj.name);
      } else if (obj.name.toLowerCase().includes('spine2')) {
        spine = obj;
        console.log("Found Spine:", obj.name);
      }
      
      
    }
  });

}, undefined, (err) => {
  console.error('Error loading model:', err);
});

// Camera position
camera.position.z = 3;

function degToRad(degrees) {
  return degrees * (Math.PI / 180);
}

window.addEventListener('unifiedPoseUpdate', (event) => {
  const { head, shoulders, arms, forearms, torso } = event.detail;
  console.log('Unified pose update received:', event.detail);
  
  setTimeout(()=>{
    console.log("Waited");
  },30000)
    
  if (headBone) {
    headBone.rotation.x = -head.x;
    headBone.rotation.y = -head.y;
    headBone.rotation.z = -head.z;
  }

  if (leftShoulderBone && rightShoulderBone) {
    leftShoulderBone.rotation.y = shoulders.left * 2;
    rightShoulderBone.rotation.y = shoulders.right * 2 ;
  }

  if (spine) {

    // spine.rotation.x = torso.x;
    // spine.rotation.y = torso.z;
    spine.rotation.z = -torso.z;
  }

  // if(leftArmBone && rightArmBone) {
  //   leftArmBone.rotation.x = degToRad(arms.left.x);
  //   leftArmBone.rotation.y = degToRad(arms.left.y);
  //   leftArmBone.rotation.z = degToRad(arms.left.z);

  //   rightArmBone.rotation.x = degToRad(arms.right.x);
  //   rightArmBone.rotation.y = degToRad(arms.right.y);
  //   rightArmBone.rotation.z = degToRad(arms.right.z);
  // }

});

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Webcam access
const video = document.getElementById('webcam');
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  video.srcObject = stream;
}).catch((err) => {
  console.error("Webcam error:", err);
});