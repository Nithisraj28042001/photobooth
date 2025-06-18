import * as poseDetection from '@mediapipe/pose';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import * as faceMesh from '@mediapipe/face_mesh';

let pose;
let faceMeshDetector;
let camera;
let videoElement;
let canvasElement;
let canvasCtx;

// Calibration variables
let isCalibrating = false;
let calibrationSamples = [];
let calibrationOffset = { x: 0, y: 0, z: 0 };
let shoulderCalibrationOffset = { left: 0, right: 0 };
let calibrationStartTime = null;
const CALIBRATION_DURATION = 3000; // 3 seconds
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

// Add these variables with other calibration variables
let armCalibrationOffset = {
  left: { x: 0, y: 0, z: 0 },
  right: { x: 0, y: 0, z: 0 }
};

// Add these variables with other calibration variables
let forearmCalibrationOffset = {
  left: { x: 0, y: 0, z: 0 },
  right: { x: 0, y: 0, z: 0 }
};

async function initPoseDetection() {
  videoElement = document.getElementById('webcam');
  canvasElement = document.createElement('canvas');
  
  // Style the canvas to overlay the video
  canvasElement.style.position = 'absolute';
  canvasElement.style.top = '0';
  canvasElement.style.left = '0';
  canvasElement.style.width = '100%';
  canvasElement.style.height = '100%';
  canvasElement.style.zIndex = '1';
  canvasElement.style.pointerEvents = 'none';
  document.querySelector('.container').appendChild(canvasElement);
  canvasCtx = canvasElement.getContext('2d');

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
        console.log(`Loading face mesh file from: ${baseUrl}/${file}`);
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
        console.log(`Loading pose file from: ${baseUrl}/${file}`);
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

    // Add error handlers for both detectors
    faceMeshDetector.onResults(onFaceMeshResults);
    pose.onResults(onPoseResults);

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
        console.log('Camera started successfully');
        
        // Start calibration after a short delay
        setTimeout(startCalibration, 1000);
      } catch (error) {
        console.error(`Camera initialization attempt ${retryCount + 1} failed:`, error);
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying camera initialization (${retryCount}/${maxRetries})...`);
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
}

function startCalibration() {
  isCalibrating = true;
  calibrationSamples = [];
  calibrationStartTime = Date.now();
  
  // Show calibration message
  canvasCtx.fillStyle = '#FFFFFF';
  canvasCtx.font = '24px Arial';
  canvasCtx.fillText('Please face the camera straight and keep shoulders level for 3 seconds...', 10, 30);
  
  console.log('Starting calibration...');
}

function calculateCalibrationOffset() {
  if (calibrationSamples.length === 0) {
    console.warn('No calibration samples collected');
    return false;
  }

  console.log('Calculating calibration offset from', calibrationSamples.length, 'samples');

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

  // Log detailed calibration results
  console.log('Calibration complete:', {
    headOffset: {
      x: calibrationOffset.x.toFixed(3),
      y: calibrationOffset.y.toFixed(3),
      z: calibrationOffset.z.toFixed(3)
    },
    shoulderOffset: {
      left: shoulderCalibrationOffset.left.toFixed(3),
      right: shoulderCalibrationOffset.right.toFixed(3)
    },
    armOffset: {
      left: {
        x: armCalibrationOffset.left.x.toFixed(3),
        y: armCalibrationOffset.left.y.toFixed(3),
        z: armCalibrationOffset.left.z.toFixed(3)
      },
      right: {
        x: armCalibrationOffset.right.x.toFixed(3),
        y: armCalibrationOffset.right.y.toFixed(3),
        z: armCalibrationOffset.right.z.toFixed(3)
      }
    },
    forearmOffset: {
      left: {
        x: forearmCalibrationOffset.left.x.toFixed(3),
        y: forearmCalibrationOffset.left.y.toFixed(3),
        z: forearmCalibrationOffset.left.z.toFixed(3)
      },
      right: {
        x: forearmCalibrationOffset.right.x.toFixed(3),
        y: forearmCalibrationOffset.right.y.toFixed(3),
        z: forearmCalibrationOffset.right.z.toFixed(3)
      }
    },
    sampleCount: calibrationSamples.length
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
    !isNaN(forearmCalibrationOffset.right.z)
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
    isCalibrated = false;
    return false;
  }

  isCalibrated = true;
  return true;
}

function onPoseResults(results) {
  // Set canvas dimensions to match video
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw video frame
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  // Draw pose landmarks
  if (results.poseLandmarks) {
    // Draw connections
    drawConnectors(canvasCtx, results.poseLandmarks, poseDetection.POSE_CONNECTIONS,
      {color: '#00FF00', lineWidth: 2});
    
    // Draw landmarks
    drawLandmarks(canvasCtx, results.poseLandmarks,
      {color: '#FF0000', lineWidth: 1, radius: 3});

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
    
    // Store the latest angles for calibration
    window.lastShoulderAngles = shoulderAngles;
    window.lastArmAngles = armAngles;
    window.lastForearmAngles = forearmAngles;
    
    if (isCalibrated) {
      // Emit shoulder angles
      window.dispatchEvent(new CustomEvent('shoulderPoseUpdate', {
        detail: shoulderAngles
      }));

      // Emit arm angles
      window.dispatchEvent(new CustomEvent('armPoseUpdate', {
        detail: armAngles
      }));

      // Emit forearm angles
      window.dispatchEvent(new CustomEvent('forearmPoseUpdate', {
        detail: forearmAngles
      }));

      // Draw debug information with more detail
      canvasCtx.fillStyle = '#FFFFFF';
      canvasCtx.font = '16px Arial';
      
      // Shoulder angles
      canvasCtx.fillStyle = '#00FF00';
      canvasCtx.fillText(`Left Shoulder: ${shoulderAngles.left.toFixed(2)}`, 10, 120);
      canvasCtx.fillText(`Right Shoulder: ${shoulderAngles.right.toFixed(2)}`, 10, 150);
      
      // Arm angles with axis labels and degrees
      canvasCtx.fillStyle = '#FF00FF';
      canvasCtx.fillText(`Left Arm - Pitch: ${armAngles.left.x.toFixed(1)}° Yaw: ${armAngles.left.y.toFixed(1)}° Roll: ${armAngles.left.z.toFixed(1)}°`, 10, 180);
      canvasCtx.fillText(`Right Arm - Pitch: ${armAngles.right.x.toFixed(1)}° Yaw: ${armAngles.right.y.toFixed(1)}° Roll: ${armAngles.right.z.toFixed(1)}°`, 10, 210);
      
      // Forearm angles with axis labels and degrees
      canvasCtx.fillStyle = '#FFFF00';
      canvasCtx.fillText(`Left Forearm - Pitch: ${forearmAngles.left.x.toFixed(1)}° Yaw: ${forearmAngles.left.y.toFixed(1)}° Roll: ${forearmAngles.left.z.toFixed(1)}°`, 10, 240);
      canvasCtx.fillText(`Right Forearm - Pitch: ${forearmAngles.right.x.toFixed(1)}° Yaw: ${forearmAngles.right.y.toFixed(1)}° Roll: ${forearmAngles.right.z.toFixed(1)}°`, 10, 270);

      // Draw angle between upper arm and forearm
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
      
      canvasCtx.fillStyle = '#00FFFF';
      canvasCtx.fillText(`Left Elbow Angle: ${leftElbowAngle.toFixed(1)}°`, 10, 300);
      canvasCtx.fillText(`Right Elbow Angle: ${rightElbowAngle.toFixed(1)}°`, 10, 330);

      // Add 3D position debugging with color coding
      const leftShoulder = results.poseLandmarks[ARM_LANDMARKS.LEFT_SHOULDER];
      const leftElbow = results.poseLandmarks[ARM_LANDMARKS.LEFT_ELBOW];
      const leftWrist = results.poseLandmarks[ARM_LANDMARKS.LEFT_WRIST];
      
      canvasCtx.fillStyle = '#FF0000';
      canvasCtx.fillText(`Left Shoulder 3D: (${leftShoulder.x.toFixed(3)}, ${leftShoulder.y.toFixed(3)}, ${leftShoulder.z.toFixed(3)})`, 10, 360);
      canvasCtx.fillStyle = '#00FF00';
      canvasCtx.fillText(`Left Elbow 3D: (${leftElbow.x.toFixed(3)}, ${leftElbow.y.toFixed(3)}, ${leftElbow.z.toFixed(3)})`, 10, 390);
      canvasCtx.fillStyle = '#0000FF';
      canvasCtx.fillText(`Left Wrist 3D: (${leftWrist.x.toFixed(3)}, ${leftWrist.y.toFixed(3)}, ${leftWrist.z.toFixed(3)})`, 10, 420);

      // Add vector debugging
      const upperArmVector = {
        x: leftElbow.x - leftShoulder.x,
        y: leftElbow.y - leftShoulder.y,
        z: leftElbow.z - leftShoulder.z
      };
      const forearmVector = {
        x: leftWrist.x - leftElbow.x,
        y: leftWrist.y - leftElbow.y,
        z: leftWrist.z - leftElbow.z
      };
      
      canvasCtx.fillStyle = '#FF00FF';
      canvasCtx.fillText(`Upper Arm Vector: (${upperArmVector.x.toFixed(3)}, ${upperArmVector.y.toFixed(3)}, ${upperArmVector.z.toFixed(3)})`, 10, 450);
      canvasCtx.fillStyle = '#FFFF00';
      canvasCtx.fillText(`Forearm Vector: (${forearmVector.x.toFixed(3)}, ${forearmVector.y.toFixed(3)}, ${forearmVector.z.toFixed(3)})`, 10, 480);

      // Add movement direction indicators
      canvasCtx.fillStyle = '#FFFFFF';
      canvasCtx.font = '14px Arial';
      canvasCtx.fillText(`Pitch: Forward/Backward | Yaw: Left/Right | Roll: Twist`, 10, 510);
      canvasCtx.fillText(`Move your arm forward to see Pitch change`, 10, 530);
      canvasCtx.fillText(`Swing your arm left/right to see Yaw change`, 10, 550);
      canvasCtx.fillText(`Rotate your wrist to see Roll change`, 10, 570);
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

  console.log({
    left: leftAngle - shoulderCalibrationOffset.left,
    right: rightAngle - shoulderCalibrationOffset.right
  })

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
  console.log('Head pose calibration:', {
    raw: rotationAngles,
    offset: calibrationOffset,
    calibrated: calibratedAngles
  });
  
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
  console.log('Yaw calculation:', {
    noseToLeftEye,
    noseToRightEye,
    distanceRatio,
    yaw
  });
  
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
  console.log('Arm angles:', calibratedAngles);

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

  // Create reference coordinate system for the arm
  // Similar to how head pose uses reference points
  
  // Forward vector (positive Z direction)
  const forwardVector = { x: 0, y: 0, z: 1 };
  
  // Up vector (negative Y direction in screen space)
  const upVector = { x: 0, y: -1, z: 0 };
  
  // Right vector (positive X direction)
  const rightVector = { x: 1, y: 0, z: 0 };

  // Calculate rotations relative to the reference coordinate system
  // This is similar to how head pose calculates rotations
  
  // Pitch (X-axis rotation) - forward/backward movement
  // Calculate angle between upper arm and the vertical plane (up vector)
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
    x: pitch * (180 / Math.PI) * 1.0,  // Pitch sensitivity
    y: yaw * (180 / Math.PI) * 1.0,    // Yaw sensitivity  
    z: roll * (180 / Math.PI) * 0.5    // Roll sensitivity (reduced)
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
  console.log('Forearm angles:', calibratedAngles);

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
  const forwardVector = { x: 0, y: 0, z: 1 };
  
  // Up vector (negative Y direction in screen space)
  const upVector = { x: 0, y: -1, z: 0 };
  
  // Right vector (positive X direction)
  const rightVector = { x: 1, y: 0, z: 0 };

  // Calculate rotations relative to the reference coordinate system
  // Pitch (X-axis rotation) - forward/backward movement
  const pitch = Math.asin(normalizedForearm.y);
  
  // Yaw (Y-axis rotation) - left/right movement
  const yaw = Math.atan2(normalizedForearm.x, normalizedForearm.z);
  
  // Roll (Z-axis rotation) - twist
  const roll = Math.atan2(normalizedForearm.x, normalizedForearm.y);

  // Convert to degrees and apply scaling
  return {
    x: pitch * (180 / Math.PI) * 1.0,  // Pitch sensitivity
    y: yaw * (180 / Math.PI) * 1.0,    // Yaw sensitivity
    z: roll * (180 / Math.PI) * 0.5    // Roll sensitivity (reduced)
  };
}

function onFaceMeshResults(results) {
  // Set canvas dimensions to match video
  canvasElement.width = videoElement.videoWidth;
  canvasElement.height = videoElement.videoHeight;
  
  // Clear canvas
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw video frame
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

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
          
          calibrationSamples.push({
            ...rotationAngles,
            shoulderAngles,
            armAngles,
            forearmAngles
          });
          
          console.log('Calibration sample collected:', {
            head: rotationAngles,
            shoulders: shoulderAngles,
            arms: armAngles,
            forearms: forearmAngles,
            sampleCount: calibrationSamples.length
          });
        }
        
        // Show calibration progress
        const progress = Math.min(elapsedTime / CALIBRATION_DURATION, 1);
        canvasCtx.fillStyle = '#FFFFFF';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText(`Calibrating... ${Math.round(progress * 100)}%`, 10, 30);
        
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
        // Only emit and display values if calibration is complete
        window.dispatchEvent(new CustomEvent('headPoseUpdate', {
          detail: rotationAngles
        }));
        
        // Draw debug information
        canvasCtx.fillStyle = '#FFFFFF';
        canvasCtx.font = '16px Arial';
        canvasCtx.fillText(`Pitch: ${rotationAngles.x.toFixed(2)}`, 10, 30);
        canvasCtx.fillText(`Yaw: ${rotationAngles.y.toFixed(2)}`, 10, 60);
        canvasCtx.fillText(`Roll: ${rotationAngles.z.toFixed(2)}`, 10, 90);
      } else {
        // Show message if not calibrated
        canvasCtx.fillStyle = '#FF0000';
        canvasCtx.font = '24px Arial';
        canvasCtx.fillText('Please wait for calibration...', 10, 30);
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

// Initialize when the page loads
window.addEventListener('load', initPoseDetection);
