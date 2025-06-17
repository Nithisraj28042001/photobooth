import gltf
from gltf._loader import GltfLoader
from panda3d.core import LoaderFileTypeRegistry
from panda3d.core import ClockObject
import math
LoaderFileTypeRegistry.getGlobalPtr().register_deferred_type(GltfLoader)
from direct.actor.Actor import Actor
from direct.showbase.ShowBase import ShowBase
from panda3d.core import AmbientLight, DirectionalLight, Vec4
import simplepbr  # optional, but recommended
globalClock = ClockObject.getGlobalClock()

import cv2
import mediapipe as mp
import numpy as np


class TestApp(ShowBase):
    def __init__(self):
        super().__init__()
        simplepbr.init()

        self.cap = cv2.VideoCapture(1)
        mp_face_mesh = mp.solutions.face_mesh
        # Setup lights
        ambient = AmbientLight("ambient")
        ambient.setColor(Vec4(0.3, 0.3, 0.3, 1))
        directional = DirectionalLight("directional")
        directional.setColor(Vec4(1, 1, 1, 1))
        directional.setDirection((-1, -1, -2))
        self.render.setLight(self.render.attach_new_node(ambient))
        self.render.setLight(self.render.attach_new_node(directional))

        # Load model
        self.model = Actor("Demon3_Low_Poly.glb")
        self.model.reparentTo(self.render)
        self.model.setScale(0.5)
        self.model.setPos(0, 2, 0)

        # Print joint names
        joint_names = [j.getName() for j in self.model.getJoints()]
        print("Available joints:", joint_names)

        # Replace with a correct name from the printed list
        self.joint_np = self.model.controlJoint(None, 'modelRoot', 'Head')

        # MediaPipe setup
        self.face_mesh = mp_face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1)

        # Initialize smoothing variables
        self.smoothed_yaw = 0.0
        self.smoothing_factor = 0.1  # Lower values = smoother movement (0.0 to 1.0)
        self.is_first_frame = True

        # Add the task
        self.taskMgr.add(self.track_head_pose, "TrackHeadPose")

    def track_head_pose(self, task):
        ret, frame = self.cap.read()
        if not ret:
            return task.cont

        h, w = frame.shape[:2]
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.face_mesh.process(frame_rgb)

        if results.multi_face_landmarks and self.joint_np is not None:
            face_landmarks = results.multi_face_landmarks[0]

            face_3d = []
            face_2d = []

            for idx in [1, 33, 263, 61, 291, 199]:
                lm = face_landmarks.landmark[idx]
                x, y = int(lm.x * w), int(lm.y * h)
                face_2d.append([x, y])
                face_3d.append([x, y, lm.z * 3000])

            face_2d = np.array(face_2d, dtype=np.float64)
            face_3d = np.array(face_3d, dtype=np.float64)

            focal_length = w
            cam_matrix = np.array([[focal_length, 0, h / 2],
                                   [0, focal_length, w / 2],
                                   [0, 0, 1]])
            dist_coeffs = np.zeros((4, 1))

            success, rot_vec, _ = cv2.solvePnP(face_3d, face_2d, cam_matrix, dist_coeffs)
            rmat, _ = cv2.Rodrigues(rot_vec)
            angles, *_ = cv2.RQDecomp3x3(rmat)

            pitch, yaw, roll = angles

            # Apply exponential smoothing
            if self.is_first_frame:
                self.smoothed_yaw = yaw
                self.is_first_frame = False
            else:
                # Exponential smoothing formula: smoothed_value = α * current_value + (1-α) * previous_smoothed_value
                self.smoothed_yaw = (self.smoothing_factor * yaw) + ((1 - self.smoothing_factor) * self.smoothed_yaw)

            print(f"Raw yaw: {yaw:.2f}, Smoothed yaw: {self.smoothed_yaw:.2f}")
            self.joint_np.setHpr(self.smoothed_yaw, 0 * 180, 0 * 180)

        return task.cont


app = TestApp()
app.run()
