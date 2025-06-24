import * as poseDetection from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import * as faceMesh from '@mediapipe/face_mesh';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import * as hands from '@mediapipe/hands';

let pose;
let faceMeshDetector;
let camera;
let videoElement;
let canvasElement;
let canvasCtx;

// Add mask canvas for segmentation
let maskCanvas;
let maskCtx;

// Calibration variables
let isCalibrating = false;
let calibrationSamples = [];
let calibrationOffset = { x: 0, y: 0, z: 0 };
let shoulderCalibrationOffset = { left: 0, right: 0 };
let calibrationStartTime = null;
const CALIBRATION_DURATION = 5000; // 5 seconds for better accuracy
const CALIBRATION_SAMPLE_RATE = 100; // Sample every 100ms
let isCalibrated = false;

// Head pose estimation variables
const FACE_LANDMARKS = {
  NOSE: 1,
  LEFT_EYE: 33,
  RIGHT_EYE: 263,
  LEFT_EAR: 234,
  RIGHT_EAR: 454,
  LEFT_MOUTH: 61,
  RIGHT_MOUTH: 291
};

// Body pose landmarks for shoulders
const POSE_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16
};

// 3D model reference points (in mm)
const MODEL_POINTS = [
  [0.0, 0.0, 0.0],          // Nose
  [-30.0, -30.0, -30.0],    // Left eye
  [30.0, -30.0, -30.0],     // Right eye
  [-60.0, 0.0, -30.0],      // Left ear
  [60.0, 0.0, -30.0],       // Right ear
  [-20.0, 20.0, -30.0],     // Left mouth
  [20.0, 20.0, -30.0]       // Right mouth
];

// Add these constants at the top with other constants
const ARM_LANDMARKS = {
  LEFT_SHOULDER: 11,
  LEFT_ELBOW: 13,
  LEFT_WRIST: 15,
  RIGHT_SHOULDER: 12,
  RIGHT_ELBOW: 14,
  RIGHT_WRIST: 16
};

// Add torso landmarks
const TORSO_LANDMARKS = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24
};

// Add these variables with other calibration variables
let armCalibrationOffset = {
  left: { x: 0, y: 0, z: 0 },
  right: { x: 0, y: 0, z: 0 }
};

// Add torso calibration offset
let torsoCalibrationOffset = { x: 0, y: 0, z: 0 };

// Add these variables with other calibration variables
let forearmCalibrationOffset = {
  left: { x: 0, y: 0, z: 0 },
  right: { x: 0, y: 0, z: 0 }
};

// Add these variables at the top with other variables
let debugInfo = {
  head: { x: 0, y: 0, z: 0 },
  torso: { x: 0, y: 0, z: 0 },
  shoulders: { left: 0, right: 0 },
  arms: { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
  forearms: { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
  elbowAngles: { left: 0, right: 0 },
  shoulder3D: { x: 0, y: 0, z: 0 },
  elbow3D: { x: 0, y: 0, z: 0 },
  wrist3D: { x: 0, y: 0, z: 0 },
  upperArmVector: { x: 0, y: 0, z: 0 },
  forearmVector: { x: 0, y: 0, z: 0 }
};

let lastFrameTime = 0;
const FRAME_RATE = 30; // 30 FPS for debug updates

// FaceLandmarker variables
let faceLandmarker;
let faceLandmarkerReady = false;
let lastFacialData = null;

async function initPoseDetection() {
  videoElement = document.getElementById('webcam');
  
  // Create a separate debug canvas that overlays the video
  canvasElement = document.createElement('canvas');
  
  // Style the canvas to overlay the video but not interfere with 3D canvas
  canvasElement.style.position = 'absolute';
  canvasElement.style.top = '0';
  canvasElement.style.left = '0';
  canvasElement.style.width = '100%';
  canvasElement.style.height = '100%';
  canvasElement.style.zIndex = '20'; // Ensure debug canvas is always on top
  canvasElement.style.pointerEvents = 'none';
  canvasElement.id = 'debug-canvas'; // Give it a unique ID
  document.querySelector('.container').appendChild(canvasElement);
  
  canvasCtx = canvasElement.getContext('2d');

  // Create and append the mask canvas (for segmentation mask)
  maskCanvas = document.createElement('canvas');
  maskCanvas.style.position = 'absolute';
  maskCanvas.style.top = '0';
  maskCanvas.style.left = '0';
  maskCanvas.style.width = '100%';
  maskCanvas.style.height = '100%';
  maskCanvas.style.zIndex = '2'; // On top of debug and 3D canvas
  maskCanvas.style.pointerEvents = 'none';
  maskCanvas.id = 'mask-canvas';
  document.querySelector('.container').appendChild(maskCanvas);
  maskCtx = maskCanvas.getContext('2d');

  try {
    // Initialize MediaPipe Face Mesh
    faceMeshDetector = new faceMesh.FaceMesh({
      locateFile: (file) => {
        // Only load face mesh related files
        if (!file.includes('face_mesh')) {
          console.warn('Unexpected file request for face mesh:', file);
          return '';
        }
        const baseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619';
        //console.log(`Loading face mesh file from: ${baseUrl}/${file}`);
        return `${baseUrl}/${file}`;
      }
    });

    faceMeshDetector.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    // Initialize MediaPipe Pose
    pose = new poseDetection.Pose({
      locateFile: (file) => {
        // Only load pose related files
        if (!file.includes('pose')) {
          console.warn('Unexpected file request for pose:', file);
          return '';
        }
        const baseUrl = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404';
        //console.log(`Loading pose file from: ${baseUrl}/${file}`);
        return `${baseUrl}/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: true,
      smoothSegmentation: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    // Initialize camera with retry logic
    let retryCount = 0;
    const maxRetries = 3;

    const initCamera = async () => {
      try {
        camera = new Camera(videoElement, {
          onFrame: async () => {
            try {
              // Process face mesh and pose separately to handle errors independently
              try {
                await faceMeshDetector.send({image: videoElement});
              } catch (faceError) {
                console.error('Error processing face mesh:', faceError);
              }
              
              try {
                await pose.send({image: videoElement});
              } catch (poseError) {
                console.error('Error processing pose:', poseError);
              }
            } catch (error) {
              console.error('Error processing frame:', error);
            }
          },
          width: 1280,
          height: 720
        });

        await camera.start();
        //console.log('Camera started successfully');
        
        // Start calibration after a short delay
        setTimeout(startCalibration, 1000);
      } catch (error) {
        console.error(`Camera initialization attempt ${retryCount + 1} failed:`, error);
        if (retryCount < maxRetries) {
          retryCount++;
          //console.log(`Retrying camera initialization (${retryCount}/${maxRetries})...`);
          setTimeout(initCamera, 1000); // Wait 1 second before retrying
        } else {
          console.error('Failed to initialize camera after multiple attempts');
          // Show error message to user
          canvasCtx.fillStyle = '#FF0000';
          canvasCtx.font = '24px Arial';
          canvasCtx.fillText('Failed to initialize camera. Please refresh the page.', 10, 30);
        }
      }
    };

    await initCamera();
  } catch (error) {
    console.error('Error initializing MediaPipe:', error);
    // Show error message to user
    canvasCtx.fillStyle = '#FF0000';
    canvasCtx.font = '24px Arial';
    canvasCtx.fillText('Error initializing face detection. Please refresh the page.', 10, 30);
  }

  // Initialize FaceLandmarker
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
  );
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
      delegate: 'CPU'
    },
    outputFaceBlendshapes: true,
    runningMode: 'VIDEO',
    numFaces: 1
  });
  faceLandmarkerReady = true;
}

function startCalibration() {
  isCalibrating = true;
  calibrationSamples = [];
  calibrationStartTime = Date.now();
  
  // Show comprehensive calibration message
  canvasCtx.fillStyle = '#FFFFFF';
  canvasCtx.font = '20px Arial';
  canvasCtx.fillText('Calibration starting in 5 seconds...', 10, 30);
  canvasCtx.fillText('Please:', 10, 60);
  canvasCtx.fillText('• Face the camera straight ahead', 10, 90);
  canvasCtx.fillText('• Keep your torso upright and centered', 10, 120);
  canvasCtx.fillText('• Keep shoulders level and relaxed', 10, 150);
  canvasCtx.fillText('• Stay still during calibration', 10, 180);
  
  //console.log('Starting calibration...');
}

function calculateCalibrationOffset() {
  if (calibrationSamples.length === 0) {
    console.warn('No calibration samples collected');
    return false;
  }

  //console.log('Calculating calibration offset from', calibrationSamples.length, 'samples');

  // Calculate head pose calibration offset (existing code)
  const sum = calibrationSamples.reduce((acc, sample) => ({
    x: acc.x + sample.x,
    y: acc.y + sample.y,
    z: acc.z + sample.z
  }), { x: 0, y: 0, z: 0 });

  calibrationOffset = {
    x: sum.x / calibrationSamples.length,
    y: sum.y / calibrationSamples.length,
    z: sum.z / calibrationSamples.length
  };

  // Calculate shoulder calibration offset (existing code)
  const shoulderSum = calibrationSamples.reduce((acc, sample) => ({
    left: acc.left + (sample.shoulderAngles?.left || 0),
    right: acc.right + (sample.shoulderAngles?.right || 0)
  }), { left: 0, right: 0 });

  shoulderCalibrationOffset = {
    left: shoulderSum.left / calibrationSamples.length,
    right: shoulderSum.right / calibrationSamples.length
  };

  // Calculate arm calibration offset
  const armSum = calibrationSamples.reduce((acc, sample) => ({
    left: {
      x: acc.left.x + (sample.armAngles?.left?.x || 0),
      y: acc.left.y + (sample.armAngles?.left?.y || 0),
      z: acc.left.z + (sample.armAngles?.left?.z || 0)
    },
    right: {
      x: acc.right.x + (sample.armAngles?.right?.x || 0),
      y: acc.right.y + (sample.armAngles?.right?.y || 0),
      z: acc.right.z + (sample.armAngles?.right?.z || 0)
    }
  }), { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } });

  armCalibrationOffset = {
    left: {
      x: armSum.left.x / calibrationSamples.length,
      y: armSum.left.y / calibrationSamples.length,
      z: armSum.left.z / calibrationSamples.length
    },
    right: {
      x: armSum.right.x / calibrationSamples.length,
      y: armSum.right.y / calibrationSamples.length,
      z: armSum.right.z / calibrationSamples.length
    }
  };

  // Calculate forearm calibration offset
  const forearmSum = calibrationSamples.reduce((acc, sample) => ({
    left: {
      x: acc.left.x + (sample.forearmAngles?.left?.x || 0),
      y: acc.left.y + (sample.forearmAngles?.left?.y || 0),
      z: acc.left.z + (sample.forearmAngles?.left?.z || 0)
    },
    right: {
      x: acc.right.x + (sample.forearmAngles?.right?.x || 0),
      y: acc.right.y + (sample.forearmAngles?.right?.y || 0),
      z: acc.right.z + (sample.forearmAngles?.right?.z || 0)
    }
  }), { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } });

  forearmCalibrationOffset = {
    left: {
      x: forearmSum.left.x / calibrationSamples.length,
      y: forearmSum.left.y / calibrationSamples.length,
      z: forearmSum.left.z / calibrationSamples.length
    },
    right: {
      x: forearmSum.right.x / calibrationSamples.length,
      y: forearmSum.right.y / calibrationSamples.length,
      z: forearmSum.right.z / calibrationSamples.length
    }
  };

  // Calculate torso calibration offset
  const torsoSum = calibrationSamples.reduce((acc, sample) => ({
    x: acc.x + (sample.torsoAngles?.x || 0),
    y: acc.y + (sample.torsoAngles?.y || 0),
    z: acc.z + (sample.torsoAngles?.z || 0)
  }), { x: 0, y: 0, z: 0 });

  torsoCalibrationOffset = {
    x: torsoSum.x / calibrationSamples.length,
    y: torsoSum.y / calibrationSamples.length,
    z: torsoSum.z / calibrationSamples.length
  };

  // Log detailed calibration results
  //console.log('Calibration complete:', {
  //   headOffset: {
  //     x: calibrationOffset.x.toFixed(3),
  //     y: calibrationOffset.y.toFixed(3),
  //     z: calibrationOffset.z.toFixed(3)
  //   },
  //   shoulderOffset: {
  //     left: shoulderCalibrationOffset.left.toFixed(3),
  //     right: shoulderCalibrationOffset.right.toFixed(3)
  //   },
  //   armOffset: {
  //     left: {
  //       x: armCalibrationOffset.left.x.toFixed(3),
  //       y: armCalibrationOffset.left.y.toFixed(3),
  //       z: armCalibrationOffset.left.z.toFixed(3)
  //     },
  //     right: {
  //       x: armCalibrationOffset.right.x.toFixed(3),
  //       y: armCalibrationOffset.right.y.toFixed(3),
  //       z: armCalibrationOffset.right.z.toFixed(3)
  //     }
  //   },
  //   forearmOffset: {
  //     left: {
  //       x: forearmCalibrationOffset.left.x.toFixed(3),
  //       y: forearmCalibrationOffset.left.y.toFixed(3),
  //       z: forearmCalibrationOffset.left.z.toFixed(3)
  //     },
  //     right: {
  //       x: forearmCalibrationOffset.right.x.toFixed(3),
  //       y: forearmCalibrationOffset.right.y.toFixed(3),
  //       z: forearmCalibrationOffset.right.z.toFixed(3)
  //     }
  //   },
  //   torsoOffset: {
  //     x: torsoCalibrationOffset.x.toFixed(3),
  //     y: torsoCalibrationOffset.y.toFixed(3),
  //     z: torsoCalibrationOffset.z.toFixed(3)
  //   },
  //   sampleCount: calibrationSamples.length
  // });

  // Log torso calibration specifically for debugging
  console.log('Torso calibration complete:', {
    offset: {
      x: torsoCalibrationOffset.x.toFixed(3),
      y: torsoCalibrationOffset.y.toFixed(3),
      z: torsoCalibrationOffset.z.toFixed(3)
    },
    sampleCount: calibrationSamples.length,
    averageSamplesPerSecond: (calibrationSamples.length / (CALIBRATION_DURATION / 1000)).toFixed(1)
  });

  // Validate calibration results
  const isValid = (
    !isNaN(calibrationOffset.x) && 
    !isNaN(calibrationOffset.y) && 
    !isNaN(calibrationOffset.z) &&
    !isNaN(shoulderCalibrationOffset.left) &&
    !isNaN(shoulderCalibrationOffset.right) &&
    !isNaN(armCalibrationOffset.left.x) &&
    !isNaN(armCalibrationOffset.left.y) &&
    !isNaN(armCalibrationOffset.left.z) &&
    !isNaN(armCalibrationOffset.right.x) &&
    !isNaN(armCalibrationOffset.right.y) &&
    !isNaN(armCalibrationOffset.right.z) &&
    !isNaN(forearmCalibrationOffset.left.x) &&
    !isNaN(forearmCalibrationOffset.left.y) &&
    !isNaN(forearmCalibrationOffset.left.z) &&
    !isNaN(forearmCalibrationOffset.right.x) &&
    !isNaN(forearmCalibrationOffset.right.y) &&
    !isNaN(forearmCalibrationOffset.right.z) &&
    !isNaN(torsoCalibrationOffset.x) &&
    !isNaN(torsoCalibrationOffset.y) &&
    !isNaN(torsoCalibrationOffset.z)
  );

  if (!isValid) {
    console.warn('Invalid calibration values detected, resetting to zero');
    calibrationOffset = { x: 0, y: 0, z: 0 };
    shoulderCalibrationOffset = { left: 0, right: 0 };
    armCalibrationOffset = {
      left: { x: 0, y: 0, z: 0 },
      right: { x: 0, y: 0, z: 0 }
    };
    forearmCalibrationOffset = {
      left: { x: 0, y: 0, z: 0 },
      right: { x: 0, y: 0, z: 0 }
    };
    torsoCalibrationOffset = { x: 0, y: 0, z: 0 };
    isCalibrated = false;
    return false;
  }

  isCalibrated = true;
  return true;
}

function onPoseResults(results) {
  // Set canvas dimensions to match video
  if (videoElement.videoWidth && videoElement.videoHeight) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
  }
  
  // Clear canvas every frame to ensure clean drawing
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

  // Draw segmentation mask if available
  if (results.segmentationMask) {
    maskCanvas.width = videoElement.videoWidth;
    maskCanvas.height = videoElement.videoHeight;
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    maskCtx.drawImage(results.segmentationMask, 0, 0, maskCanvas.width, maskCanvas.height);
  } else {
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  }

  // Draw pose landmarks
  if (results.poseLandmarks) {
    // Draw connections
    drawConnectors(canvasCtx, results.poseLandmarks, poseDetection.POSE_CONNECTIONS,
      {color: '#00FF00', lineWidth: 2});
    
    // Draw landmarks
    drawLandmarks(canvasCtx, results.poseLandmarks,
      {color: '#FF0000', lineWidth: 1, radius: 3});

    // Draw torso landmarks specifically with different colors
    drawTorsoLandmarks(results.poseLandmarks);

    // Optional: Add text labels for key points
    results.poseLandmarks.forEach((landmark, index) => {
      canvasCtx.fillStyle = '#FFFFFF';
      canvasCtx.font = '12px Arial';
      canvasCtx.fillText(index.toString(), 
        landmark.x * canvasElement.width, 
        landmark.y * canvasElement.height);
    });

    const shoulderAngles = calculateShoulderAngles(results.poseLandmarks);
    const armAngles = calculateArmAngles(results.poseLandmarks);
    const forearmAngles = calculateForearmAngles(results.poseLandmarks);
    const torsoAngles = calculateTorsoAngles(results.poseLandmarks);
    
    // Store the latest angles for calibration
    window.lastShoulderAngles = shoulderAngles;
    window.lastArmAngles = armAngles;
    window.lastForearmAngles = forearmAngles;
    window.lastTorsoAngles = torsoAngles;
    
    if (isCalibrated) {
      // Update debug info
      debugInfo.shoulders = shoulderAngles;
      debugInfo.arms = armAngles;
      debugInfo.forearms = forearmAngles;
      debugInfo.torso = torsoAngles;

      // Calculate elbow angles
      const leftElbowAngle = calculateElbowAngle(
        results.poseLandmarks[ARM_LANDMARKS.LEFT_SHOULDER],
        results.poseLandmarks[ARM_LANDMARKS.LEFT_ELBOW],
        results.poseLandmarks[ARM_LANDMARKS.LEFT_WRIST]
      );
      const rightElbowAngle = calculateElbowAngle(
        results.poseLandmarks[ARM_LANDMARKS.RIGHT_SHOULDER],
        results.poseLandmarks[ARM_LANDMARKS.RIGHT_ELBOW],
        results.poseLandmarks[ARM_LANDMARKS.RIGHT_WRIST]
      );
      
      debugInfo.elbowAngles = { left: leftElbowAngle, right: rightElbowAngle };

      // Update 3D position debugging
      const leftShoulder = results.poseLandmarks[ARM_LANDMARKS.LEFT_SHOULDER];
      const leftElbow = results.poseLandmarks[ARM_LANDMARKS.LEFT_ELBOW];
      const leftWrist = results.poseLandmarks[ARM_LANDMARKS.LEFT_WRIST];
      
      debugInfo.shoulder3D = leftShoulder;
      debugInfo.elbow3D = leftElbow;
      debugInfo.wrist3D = leftWrist;

      // Update vector debugging
      debugInfo.upperArmVector = {
        x: leftElbow.x - leftShoulder.x,
        y: leftElbow.y - leftShoulder.y,
        z: leftElbow.z - leftShoulder.z
      };
      debugInfo.forearmVector = {
        x: leftWrist.x - leftElbow.x,
        y: leftWrist.y - leftElbow.y,
        z: leftWrist.z - leftElbow.z
      };

      // Create unified pose data object
      const unifiedPoseData = {
        head: window.lastHeadPose || { x: 0, y: 0, z: 0 },
        shoulders: shoulderAngles,
        arms: armAngles,
        forearms: forearmAngles,
        torso: torsoAngles
      };

      // Dispatch unified pose update event
      window.dispatchEvent(new CustomEvent('unifiedPoseUpdate', {
        detail: unifiedPoseData
      }));

      // Draw all debug information
      drawDebugInfo();

      // Dispatch wrist positions (single joint per hand)
      const leftWristPos = results.poseLandmarks[POSE_LANDMARKS.LEFT_WRIST];
      const rightWristPos = results.poseLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
      window.dispatchEvent(new CustomEvent('wristUpdate', {
        detail: {
          left: leftWristPos,
          right: rightWristPos
        }
      }));
    }
  }
}

function calculateShoulderAngles(landmarks) {
  if (!landmarks) return { left: 0, right: 0 };

  const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  const leftElbow = landmarks[POSE_LANDMARKS.LEFT_ELBOW];
  const rightElbow = landmarks[POSE_LANDMARKS.RIGHT_ELBOW];

  // Calculate left shoulder angle
  const leftAngle = calculateAngle(
    leftShoulder,
    leftElbow,
    { x: leftShoulder.x, y: leftShoulder.y - 1 } // Reference point above shoulder
  );

  // Calculate right shoulder angle
  const rightAngle = calculateAngle(
    rightShoulder,
    rightElbow,
    { x: rightShoulder.x, y: rightShoulder.y - 1 } // Reference point above shoulder
  );

  //console.log({
  //   left: leftAngle - shoulderCalibrationOffset.left,
  //   right: rightAngle - shoulderCalibrationOffset.right
  // })

  return {
    left: leftAngle - shoulderCalibrationOffset.left,
    right: rightAngle - shoulderCalibrationOffset.right
  };
}

function calculateAngle(point1, point2, reference) {
  const v1 = {
    x: point1.x - reference.x,
    y: point1.y - reference.y
  };
  const v2 = {
    x: point2.x - reference.x,
    y: point2.y - reference.y
  };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
  
  const cos = dot / (mag1 * mag2);
  const angle = Math.acos(Math.max(-1, Math.min(1, cos)));
  
  // Determine direction (clockwise or counterclockwise)
  const cross = v1.x * v2.y - v1.y * v2.x;
  return cross > 0 ? angle : -angle;
}

function calculateHeadPose(landmarks) {
  // Get 2D points from landmarks
  const imagePoints = [
    landmarks[FACE_LANDMARKS.NOSE],
    landmarks[FACE_LANDMARKS.LEFT_EYE],
    landmarks[FACE_LANDMARKS.RIGHT_EYE],
    landmarks[FACE_LANDMARKS.LEFT_EAR],
    landmarks[FACE_LANDMARKS.RIGHT_EAR],
    landmarks[FACE_LANDMARKS.LEFT_MOUTH],
    landmarks[FACE_LANDMARKS.RIGHT_MOUTH]
  ];

  // Convert to normalized coordinates
  const normalizedPoints = imagePoints.map(point => ({
    x: point.x * canvasElement.width,
    y: point.y * canvasElement.height
  }));

  // Calculate rotation angles using PnP
  const rotationAngles = solvePnP(normalizedPoints);
  
  // Apply calibration offset with additional yaw normalization
  const calibratedAngles = {
    x: (rotationAngles.x - calibrationOffset.x),
    y: (rotationAngles.y - calibrationOffset.y) , // Reduce yaw sensitivity
    z: (rotationAngles.z - calibrationOffset.z)
  };

  // Log the calibration process
  //console.log('Head pose calibration:', {
  //   raw: rotationAngles,
  //   offset: calibrationOffset,
  //   calibrated: calibratedAngles
  // });
  
  return calibratedAngles;
}

function solvePnP(imagePoints) {
  // Simple approximation of head rotation angles
  const nose = imagePoints[0];
  const leftEye = imagePoints[1];
  const rightEye = imagePoints[2];
  const leftEar = imagePoints[3];
  const rightEar = imagePoints[4];
  
  // Calculate roll (rotation around Z-axis)
  const eyeAngle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const roll = eyeAngle;
  
  // Calculate yaw (rotation around Y-axis) using eye distance ratio
  const eyeDistance = Math.sqrt(
    Math.pow(rightEye.x - leftEye.x, 2) + 
    Math.pow(rightEye.y - leftEye.y, 2)
  );
  
  // Calculate the distance from nose to each eye
  const noseToLeftEye = Math.sqrt(
    Math.pow(nose.x - leftEye.x, 2) + 
    Math.pow(nose.y - leftEye.y, 2)
  );
  
  const noseToRightEye = Math.sqrt(
    Math.pow(nose.x - rightEye.x, 2) + 
    Math.pow(nose.y - rightEye.y, 2)
  );
  
  // Calculate the ratio of distances
  const distanceRatio = noseToLeftEye / noseToRightEye;
  
  // Convert ratio to yaw angle (in radians)
  // When ratio is 1, yaw is 0 (facing forward)
  // When ratio is > 1, yaw is positive (turned left)
  // When ratio is < 1, yaw is negative (turned right)
  const yaw = Math.log(distanceRatio) * 0.5; // Scale factor to control sensitivity
  
  // Calculate pitch (rotation around X-axis)
  const noseToEyes = (leftEye.y + rightEye.y) / 2 - nose.y;
  const pitch = noseToEyes / 50; // Normalized approximation
  
  // Log the yaw calculation components for debugging
  //console.log('Yaw calculation:', {
  //   noseToLeftEye,
  //   noseToRightEye,
  //   distanceRatio,
  //   yaw
  // });
  
  return {
    x: pitch,    // Pitch (nodding up/down)
    y: yaw,      // Yaw (turning left/right)
    z: roll      // Roll (tilting left/right)
  };
}

function calculateArmAngles(landmarks) {
  if (!landmarks) return { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };

  // Get relevant landmarks
  const leftShoulder = landmarks[ARM_LANDMARKS.LEFT_SHOULDER];
  const leftElbow = landmarks[ARM_LANDMARKS.LEFT_ELBOW];
  const leftWrist = landmarks[ARM_LANDMARKS.LEFT_WRIST];
  const rightShoulder = landmarks[ARM_LANDMARKS.RIGHT_SHOULDER];
  const rightElbow = landmarks[ARM_LANDMARKS.RIGHT_ELBOW];
  const rightWrist = landmarks[ARM_LANDMARKS.RIGHT_WRIST];

  // Calculate left arm angles
  const leftArmAngles = calculateArmRotation(
    leftShoulder,
    leftElbow,
    leftWrist,
    { x: leftShoulder.x, y: leftShoulder.y - 1 } // Reference point above shoulder
  );

  // Calculate right arm angles
  const rightArmAngles = calculateArmRotation(
    rightShoulder,
    rightElbow,
    rightWrist,
    { x: rightShoulder.x, y: rightShoulder.y - 1 } // Reference point above shoulder
  );

  // Apply calibration offset
  const calibratedAngles = {
    left: {
      x: leftArmAngles.x - armCalibrationOffset.left.x,
      y: leftArmAngles.y - armCalibrationOffset.left.y,
      z: leftArmAngles.z - armCalibrationOffset.left.z
    },
    right: {
      x: rightArmAngles.x - armCalibrationOffset.right.x,
      y: rightArmAngles.y - armCalibrationOffset.right.y,
      z: rightArmAngles.z - armCalibrationOffset.right.z
    }
  };

  // Log arm angles for debugging
  //console.log('Arm angles:', calibratedAngles);

  return calibratedAngles;
}

function calculateArmRotation(shoulder, elbow, wrist, reference) {
  // Calculate the upper arm vector in 3D space
  const upperArm = {
    x: elbow.x - shoulder.x,
    y: elbow.y - shoulder.y,
    z: elbow.z - shoulder.z
  };

  // Calculate the forearm vector in 3D space
  const forearm = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y,
    z: wrist.z - elbow.z
  };

  // Normalize vectors
  const normalize = (v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    };
  };

  const normalizedUpperArm = normalize(upperArm);
  const normalizedForearm = normalize(forearm);

  // // Create reference coordinate system for the arm
  // // Similar to how head pose uses reference points
  
  // // Forward vector (positive Z direction)
  // const forwardVector = { x: 0, y: 0, z: 1 };
  
  // // Up vector (negative Y direction in screen space)
  // const upVector = { x: 0, y: -1, z: 0 };
  
  // // Right vector (positive X direction)
  // const rightVector = { x: 1, y: 0, z: 0 };

  // // Calculate rotations relative to the reference coordinate system
  // // This is similar to how head pose calculates rotations
  
  // // Pitch (X-axis rotation) - forward/backward movement
  // // Calculate angle between upper arm and the vertical plane (up vector)
  const pitch = Math.asin(normalizedUpperArm.y);
  
  // Yaw (Y-axis rotation) - left/right movement  
  // Calculate horizontal angle of upper arm relative to forward direction
  const yaw = Math.atan2(normalizedUpperArm.x, normalizedUpperArm.z);
  
  // Roll (Z-axis rotation) - twist
  // Calculate twist by comparing forearm orientation to upper arm
  const roll = Math.atan2(
    normalizedForearm.x * normalizedUpperArm.y - normalizedForearm.y * normalizedUpperArm.x,
    normalizedForearm.z * normalizedUpperArm.y - normalizedForearm.y * normalizedUpperArm.z
  );

  // Convert to degrees and apply scaling
  return {
    x: pitch ,  // Pitch sensitivity
    y: yaw ,    // Yaw sensitivity  
    z: roll    // Roll sensitivity (reduced)
  };
}

function calculateForearmAngles(landmarks) {
  if (!landmarks) return { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };

  // Get relevant landmarks
  const leftElbow = landmarks[ARM_LANDMARKS.LEFT_ELBOW];
  const leftWrist = landmarks[ARM_LANDMARKS.LEFT_WRIST];
  const rightElbow = landmarks[ARM_LANDMARKS.RIGHT_ELBOW];
  const rightWrist = landmarks[ARM_LANDMARKS.RIGHT_WRIST];

  // Calculate left forearm angles
  const leftForearmAngles = calculateForearmRotation(
    leftElbow,
    leftWrist,
    { x: leftElbow.x, y: leftElbow.y - 1 } // Reference point above elbow
  );

  // Calculate right forearm angles
  const rightForearmAngles = calculateForearmRotation(
    rightElbow,
    rightWrist,
    { x: rightElbow.x, y: rightElbow.y - 1 } // Reference point above elbow
  );

  // Apply calibration offset
  const calibratedAngles = {
    left: {
      x: leftForearmAngles.x - forearmCalibrationOffset.left.x,
      y: leftForearmAngles.y - forearmCalibrationOffset.left.y,
      z: leftForearmAngles.z - forearmCalibrationOffset.left.z
    },
    right: {
      x: rightForearmAngles.x - forearmCalibrationOffset.right.x,
      y: rightForearmAngles.y - forearmCalibrationOffset.right.y,
      z: rightForearmAngles.z - forearmCalibrationOffset.right.z
    }
  };

  // Log forearm angles for debugging
  //console.log('Forearm angles:', calibratedAngles);

  return calibratedAngles;
}

function calculateForearmRotation(elbow, wrist, reference) {
  // Calculate the forearm vector in 3D space
  const forearm = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y,
    z: wrist.z - elbow.z
  };

  // Normalize the forearm vector
  const normalize = (v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    };
  };

  const normalizedForearm = normalize(forearm);

  // Create reference coordinate system for the forearm
  // Forward vector (positive Z direction)
  // const forwardVector = { x: 0, y: 0, z: 1 };
  
  // // Up vector (negative Y direction in screen space)
  // const upVector = { x: 0, y: -1, z: 0 };
  
  // // Right vector (positive X direction)
  // const rightVector = { x: 1, y: 0, z: 0 };

  // Calculate rotations relative to the reference coordinate system
  // Pitch (X-axis rotation) - forward/backward movement
  const pitch = Math.asin(normalizedForearm.y);
  
  // Yaw (Y-axis rotation) - left/right movement
  const yaw = Math.atan2(normalizedForearm.x, normalizedForearm.z);
  
  // Roll (Z-axis rotation) - twist
  const roll = Math.atan2(normalizedForearm.x, normalizedForearm.y);

  // Convert to degrees and apply scaling
  return {
    x: pitch ,  // Pitch sensitivity
    y: yaw ,    // Yaw sensitivity
    z: roll   // Roll sensitivity (reduced)
  };
}

function calculateTorsoAngles(landmarks) {
  if (!landmarks) return { x: 0, y: 0, z: 0 };

  // Get relevant landmarks
  const leftShoulder = landmarks[TORSO_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[TORSO_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[TORSO_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[TORSO_LANDMARKS.RIGHT_HIP];

  // Validate that all landmarks are present and have reasonable values
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) {
    return { x: 0, y: 0, z: 0 };
  }

  // Additional validation: check if landmarks have valid coordinates
  const isValidLandmark = (landmark) => {
    return landmark && 
           typeof landmark.x === 'number' && 
           typeof landmark.y === 'number' && 
           typeof landmark.z === 'number' &&
           !isNaN(landmark.x) && !isNaN(landmark.y) && !isNaN(landmark.z);
  };

  if (!isValidLandmark(leftShoulder) || !isValidLandmark(rightShoulder) || 
      !isValidLandmark(leftHip) || !isValidLandmark(rightHip)) {
    return { x: 0, y: 0, z: 0 };
  }

  // Calculate torso center points
  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: (leftShoulder.z + rightShoulder.z) / 2
  };

  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: (leftHip.z + rightHip.z) / 2
  };

  // Calculate spine vector (from hip center to shoulder center)
  const spineVector = {
    x: shoulderCenter.x - hipCenter.x,
    y: shoulderCenter.y - hipCenter.y,
    z: shoulderCenter.z - hipCenter.z
  };

  // Calculate shoulder line vector (left to right shoulder)
  const shoulderVector = {
    x: rightShoulder.x - leftShoulder.x,
    y: rightShoulder.y - leftShoulder.y,
    z: rightShoulder.z - leftShoulder.z
  };

  // Calculate hip line vector (left to right hip)
  const hipVector = {
    x: rightHip.x - leftHip.x,
    y: rightHip.y - leftHip.y,
    z: rightHip.z - leftHip.z
  };

  // Normalize vectors with safety checks
  const normalize = (v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (length < 0.001) return { x: 0, y: 0, z: 0 }; // Avoid division by zero
    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    };
  };

  const normalizedSpine = normalize(spineVector);
  const normalizedShoulder = normalize(shoulderVector);
  const normalizedHip = normalize(hipVector);

  // Check if normalization was successful
  if (normalizedSpine.x === 0 && normalizedSpine.y === 0 && normalizedSpine.z === 0) {
    return { x: 0, y: 0, z: 0 };
  }

  // Calculate torso rotations using proper mathematical approach
  // Similar to head pose calculation but adapted for torso
  
  // Pitch (X-axis rotation) - forward/backward lean
  // Calculate angle between spine and vertical (negative Y direction in screen space)
  const pitch = Math.asin(normalizedSpine.y);
  
  // Yaw (Y-axis rotation) - left/right rotation
  // Calculate horizontal angle of spine relative to forward direction (positive Z)
  const yaw = Math.atan2(normalizedSpine.x, normalizedSpine.z);
  
  // Roll (Z-axis rotation) - left/right tilt
  // Calculate tilt based on shoulder line orientation relative to horizontal
  const roll = Math.atan2(normalizedShoulder.y, normalizedShoulder.x);

  // Convert to degrees and apply sensitivity scaling
  const torsoAngles = {
    x: pitch ,  // Pitch sensitivity
    y: yaw ,    // Yaw sensitivity
    z: roll    // Roll sensitivity
  };

  // Apply calibration offset (similar to head pose)
  const calibratedAngles = {
    x: torsoAngles.x - torsoCalibrationOffset.x,
    y: torsoAngles.y - torsoCalibrationOffset.y,
    z: torsoAngles.z - torsoCalibrationOffset.z
  };
  
  return {
    x: calibratedAngles.x,   // Limit pitch to reasonable range
    y: calibratedAngles.y, // Allow full yaw rotation
    z: calibratedAngles.z    // Limit roll to reasonable range
  };
}

async function onFaceMeshResults(results) {
  // Set canvas dimensions to match video
  if (videoElement.videoWidth && videoElement.videoHeight) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
  }

  if (results.multiFaceLandmarks) {
    for (const landmarks of results.multiFaceLandmarks) {
      // Draw face mesh
      drawConnectors(canvasCtx, landmarks, faceMesh.FACEMESH_TESSELATION,
        {color: '#C0C0C070', lineWidth: 1});
      
      // Calculate head pose
      const rotationAngles = calculateHeadPose(landmarks);
      
      // Handle calibration
      if (isCalibrating) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - calibrationStartTime;
        
        if (elapsedTime % CALIBRATION_SAMPLE_RATE < 16) {
          const rotationAngles = calculateHeadPose(landmarks);
          const shoulderAngles = window.lastShoulderAngles || { left: 0, right: 0 };
          const armAngles = window.lastArmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };
          const forearmAngles = window.lastForearmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } };
          const torsoAngles = window.lastTorsoAngles || { x: 0, y: 0, z: 0 };
          
          calibrationSamples.push({
            ...rotationAngles,
            shoulderAngles,
            armAngles,
            forearmAngles,
            torsoAngles
          });
        }
        
        // Show calibration progress
        const progress = Math.min(elapsedTime / CALIBRATION_DURATION, 1);
        canvasCtx.fillStyle = '#FFFFFF';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText(`Calibrating... ${Math.round(progress * 100)}%`, 10, 30);
        canvasCtx.font = '16px Arial';
        canvasCtx.fillText(`Samples collected: ${calibrationSamples.length}`, 10, 60);
        canvasCtx.fillText(`Time remaining: ${Math.max(0, Math.ceil((CALIBRATION_DURATION - elapsedTime) / 1000))}s`, 10, 90);
        
        // End calibration after duration
        if (elapsedTime >= CALIBRATION_DURATION) {
          isCalibrating = false;
          const calibrationSuccess = calculateCalibrationOffset();
          if (calibrationSuccess) {
            canvasCtx.fillText('Calibration complete!', 10, 30);
            setTimeout(() => {
              canvasCtx.clearRect(0, 0, canvasElement.width, 30);
            }, 2000);
          } else {
            canvasCtx.fillStyle = '#FF0000';
            canvasCtx.fillText('Calibration failed! Please try again.', 10, 30);
            setTimeout(() => {
              startCalibration(); // Restart calibration
            }, 2000);
          }
        }
      } else if (isCalibrated) {
        // Store head pose data globally for pose detection system
        window.lastHeadPose = rotationAngles;
        
        // Update debug info
        debugInfo.head = rotationAngles;
        
        // Only emit and display values if calibration is complete
        window.dispatchEvent(new CustomEvent('headPoseUpdate', {
          detail: rotationAngles
        }));
        
        // Create unified pose data including head pose
        const unifiedPoseData = {
          head: rotationAngles,
          torso: window.lastTorsoAngles || { x: 0, y: 0, z: 0 },
          shoulders: window.lastShoulderAngles || { left: 0, right: 0 },
          arms: window.lastArmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
          forearms: window.lastForearmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
        };

        // Dispatch unified pose update event
        window.dispatchEvent(new CustomEvent('unifiedPoseUpdate', {
          detail: unifiedPoseData
        }));
        
        // Draw debug info again to ensure head pose is included
        drawDebugInfo();
      } else {
        // Show message if not calibrated
        canvasCtx.fillStyle = '#FF0000';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText('Please wait for calibration...', 10, 30);
      }
    }
  }

  // Run FaceLandmarker if ready
  if (faceLandmarkerReady && results.image) {
    const currentTime = performance.now();
    if (currentTime - lastFrameTime >= 1000 / FRAME_RATE) {
      lastFrameTime = currentTime;
      const facialData = await faceLandmarker.detectForVideo(results.image, currentTime);
      if (facialData.faceLandmarks && facialData.faceLandmarks.length > 0) {
        lastFacialData = facialData;
        const unifiedPoseData = {
          head: window.lastHeadPose || { x: 0, y: 0, z: 0 },
          torso: window.lastTorsoAngles || { x: 0, y: 0, z: 0 },
          shoulders: window.lastShoulderAngles || { left: 0, right: 0 },
          arms: window.lastArmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
          forearms: window.lastForearmAngles || { left: { x: 0, y: 0, z: 0 }, right: { x: 0, y: 0, z: 0 } },
          facial: facialData
        };
        window.dispatchEvent(new CustomEvent('unifiedPoseUpdate', {
          detail: unifiedPoseData
        }));
      }
    }
  }
}

// Add a function to calculate the angle between upper arm and forearm more accurately
function calculateElbowAngle(shoulder, elbow, wrist) {
  // Calculate vectors
  const upperArm = {
    x: elbow.x - shoulder.x,
    y: elbow.y - shoulder.y,
    z: elbow.z - shoulder.z
  };
  
  const forearm = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y,
    z: wrist.z - elbow.z
  };

  // Normalize vectors
  const normalize = (v) => {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return {
      x: v.x / length,
      y: v.y / length,
      z: v.z / length
    };
  };

  const n1 = normalize(upperArm);
  const n2 = normalize(forearm);

  // Calculate dot product
  const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  
  // Calculate angle in degrees
  const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);

  return angle;
}

function drawTorsoLandmarks(landmarks) {
  if (!landmarks) return;

  // Get torso landmarks
  const leftShoulder = landmarks[TORSO_LANDMARKS.LEFT_SHOULDER];
  const rightShoulder = landmarks[TORSO_LANDMARKS.RIGHT_SHOULDER];
  const leftHip = landmarks[TORSO_LANDMARKS.LEFT_HIP];
  const rightHip = landmarks[TORSO_LANDMARKS.RIGHT_HIP];

  // Validate landmarks
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;

  // Draw torso landmarks with special colors
  const drawLandmark = (landmark, color, radius = 6) => {
    canvasCtx.fillStyle = color;
    canvasCtx.beginPath();
    canvasCtx.arc(
      landmark.x * canvasElement.width,
      landmark.y * canvasElement.height,
      radius,
      0,
      2 * Math.PI
    );
    canvasCtx.fill();
  };

  // Draw shoulder landmarks in orange
  drawLandmark(leftShoulder, '#000000', 8);
  drawLandmark(rightShoulder, '#000000', 8);

  // Draw hip landmarks in purple
  drawLandmark(leftHip, '#800080', 8);
  drawLandmark(rightHip, '#800080', 8);

  // Draw spine line (hip center to shoulder center)
  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2
  };

  canvasCtx.strokeStyle = '#FFD700'; // Gold color for spine
  canvasCtx.lineWidth = 4;
  canvasCtx.beginPath();
  canvasCtx.moveTo(hipCenter.x * canvasElement.width, hipCenter.y * canvasElement.height);
  canvasCtx.lineTo(shoulderCenter.x * canvasElement.width, shoulderCenter.y * canvasElement.height);
  canvasCtx.stroke();

  // Draw shoulder line
  canvasCtx.strokeStyle = '#FFA500'; // Orange for shoulder line
  canvasCtx.lineWidth = 3;
  canvasCtx.beginPath();
  canvasCtx.moveTo(leftShoulder.x * canvasElement.width, leftShoulder.y * canvasElement.height);
  canvasCtx.lineTo(rightShoulder.x * canvasElement.width, rightShoulder.y * canvasElement.height);
  canvasCtx.stroke();

  // Draw hip line
  canvasCtx.strokeStyle = '#800080'; // Purple for hip line
  canvasCtx.lineWidth = 3;
  canvasCtx.beginPath();
  canvasCtx.moveTo(leftHip.x * canvasElement.width, leftHip.y * canvasElement.height);
  canvasCtx.lineTo(rightHip.x * canvasElement.width, rightHip.y * canvasElement.height);
  canvasCtx.stroke();
}

// Add a new function to draw all debug information
function drawDebugInfo() {
  if (!isCalibrated) return;

  // Head pose (white text)
  canvasCtx.fillStyle = '#FFFFFF';
  canvasCtx.font = '16px Arial';
  canvasCtx.fillText(`Pitch: ${debugInfo.head.x.toFixed(2)}`, 10, 30);
  canvasCtx.fillText(`Yaw: ${debugInfo.head.y.toFixed(2)}`, 10, 60);
  canvasCtx.fillText(`Roll: ${debugInfo.head.z.toFixed(2)}`, 10, 90);
  
  // Torso angles (orange text)
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Torso - Pitch: ${debugInfo.torso.x.toFixed(1)}° Yaw: ${debugInfo.torso.y.toFixed(1)}° Roll: ${debugInfo.torso.z.toFixed(1)}°`, 10, 120);
  
  // Shoulder angles (green text)
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Shoulder: ${debugInfo.shoulders.left.toFixed(2)}`, 10, 150);
  canvasCtx.fillText(`Right Shoulder: ${debugInfo.shoulders.right.toFixed(2)}`, 10, 180);
  
  // Arm angles with axis labels and degrees (magenta text)
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Arm - Pitch: ${debugInfo.arms.left.x.toFixed(1)}° Yaw: ${debugInfo.arms.left.y.toFixed(1)}° Roll: ${debugInfo.arms.left.z.toFixed(1)}°`, 10, 210);
  canvasCtx.fillText(`Right Arm - Pitch: ${debugInfo.arms.right.x.toFixed(1)}° Yaw: ${debugInfo.arms.right.y.toFixed(1)}° Roll: ${debugInfo.arms.right.z.toFixed(1)}°`, 10, 240);
  
  // Forearm angles with axis labels and degrees (yellow text)
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Forearm - Pitch: ${debugInfo.forearms.left.x.toFixed(1)}° Yaw: ${debugInfo.forearms.left.y.toFixed(1)}° Roll: ${debugInfo.forearms.left.z.toFixed(1)}°`, 10, 270);
  canvasCtx.fillText(`Right Forearm - Pitch: ${debugInfo.forearms.right.x.toFixed(1)}° Yaw: ${debugInfo.forearms.right.y.toFixed(1)}° Roll: ${debugInfo.forearms.right.z.toFixed(1)}°`, 10, 300);

  // Elbow angles (cyan text)
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Elbow Angle: ${debugInfo.elbowAngles.left.toFixed(1)}°`, 10, 330);
  canvasCtx.fillText(`Right Elbow Angle: ${debugInfo.elbowAngles.right.toFixed(1)}°`, 10, 360);

  // 3D position debugging with color coding
  canvasCtx.fillStyle = '#FF0000';
  canvasCtx.fillText(`Left Shoulder 3D: (${debugInfo.shoulder3D.x.toFixed(3)}, ${debugInfo.shoulder3D.y.toFixed(3)}, ${debugInfo.shoulder3D.z.toFixed(3)})`, 10, 390);
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Elbow 3D: (${debugInfo.elbow3D.x.toFixed(3)}, ${debugInfo.elbow3D.y.toFixed(3)}, ${debugInfo.elbow3D.z.toFixed(3)})`, 10, 420);
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Left Wrist 3D: (${debugInfo.wrist3D.x.toFixed(3)}, ${debugInfo.wrist3D.y.toFixed(3)}, ${debugInfo.wrist3D.z.toFixed(3)})`, 10, 450);

  // Vector debugging
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Upper Arm Vector: (${debugInfo.upperArmVector.x.toFixed(3)}, ${debugInfo.upperArmVector.y.toFixed(3)}, ${debugInfo.upperArmVector.z.toFixed(3)})`, 10, 480);
  canvasCtx.fillStyle = '#000000';
  canvasCtx.fillText(`Forearm Vector: (${debugInfo.forearmVector.x.toFixed(3)}, ${debugInfo.forearmVector.y.toFixed(3)}, ${debugInfo.forearmVector.z.toFixed(3)})`, 10, 510);

  // Movement direction indicators
  canvasCtx.fillStyle = '#FFFFFF';
  canvasCtx.font = '14px Arial';
  canvasCtx.fillText(`Pitch: Forward/Backward | Yaw: Left/Right | Roll: Twist`, 10, 540);
  canvasCtx.fillText(`Move your arm forward to see Pitch change`, 10, 560);
  canvasCtx.fillText(`Swing your arm left/right to see Yaw change`, 10, 580);
  canvasCtx.fillText(`Rotate your wrist to see Roll change`, 10, 600);
  canvasCtx.fillText(`Lean forward/backward to see Torso Pitch change`, 10, 620);
  canvasCtx.fillText(`Turn left/right to see Torso Yaw change`, 10, 640);
  canvasCtx.fillText(`Tilt left/right to see Torso Roll change`, 10, 660);
}

// Initialize when the page loads
window.addEventListener('load', initPoseDetection);
