import cv2
import numpy as np
import math
import mediapipe as mp

from direct.showbase.ShowBase import ShowBase
from direct.actor.Actor import Actor
from panda3d.core import Texture, CardMaker, ClockObject, Vec4
from panda3d.core import AmbientLight, DirectionalLight
from panda3d.core import LoaderFileTypeRegistry
from gltf._loader import GltfLoader
import simplepbr

# Register glTF loader
LoaderFileTypeRegistry.getGlobalPtr().register_deferred_type(GltfLoader)
globalClock = ClockObject.getGlobalClock()

# Panda window setup
from panda3d.core import loadPrcFileData
loadPrcFileData('', 'win-size 1280 720')
loadPrcFileData('', 'window-title My AR Viewer')


class ARHandTrackingDemo(ShowBase):
    def __init__(self):
        super().__init__()
        simplepbr.init()

        # === Camera Init ===
        self.cap = cv2.VideoCapture(0)
        ret, frame = self.cap.read()
        self.frame_height, self.frame_width = frame.shape[:2]

        # === MediaPipe Hands ===
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(max_num_hands=2,
                                         min_detection_confidence=0.7,
                                         min_tracking_confidence=0.7)

        # === Background Setup ===
        self.tex = Texture()
        self.tex.setup2dTexture(self.frame_width, self.frame_height, Texture.T_unsigned_byte, Texture.F_rgb)
        cm = CardMaker("bg_card")
        cm.setFrame(-1, 1, -1, 1)
        self.bg = self.render.attachNewNode(cm.generate())
        self.bg.setPos(0, 10, 0)
        self.bg.setScale(12, 1, 7.5)
        self.bg.setTexture(self.tex)
        self.cam.setPos(0, -15, 0)
        self.cam.lookAt(0, 10, 0)

        # === Load Model ===
        self.model = Actor("Demon3_Low_Poly.glb")
        self.model.reparentTo(self.render)
        self.model.setScale(2)
        self.model.setPos(0, 2, -1)

        # === Lighting ===
        ambient = AmbientLight("ambient")
        ambient.setColor(Vec4(0.4, 0.4, 0.4, 1))
        self.render.setLight(self.render.attachNewNode(ambient))

        directional = DirectionalLight("directional")
        directional.setColor(Vec4(1, 1, 1, 1))
        directional.setDirection((-1, -1, -2))
        self.render.setLight(self.render.attachNewNode(directional))

        # === Joint Controls ===
        self.head_joint = self.model.controlJoint(None, 'modelRoot', 'Head')
        self.handL_joint = self.model.controlJoint(None, 'modelRoot', 'hand.L')
        self.indexL_joint = self.model.controlJoint(None, 'modelRoot', 'f_index.01.L')
        self.handR_joint = self.model.controlJoint(None, 'modelRoot', 'hand.R')
        self.indexR_joint = self.model.controlJoint(None, 'modelRoot', 'f_index.01.R')

        # === Tasks ===
        self.taskMgr.add(self.update_camera_texture, "UpdateCamTex")
        self.taskMgr.add(self.animate_head, "HeadSway")
        self.taskMgr.add(self.track_hands_and_animate, "HandTracking")

    def update_camera_texture(self, task):
        ret, frame = self.cap.read()
        if ret:
            frame = cv2.flip(frame, -1)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)
            self.hand_results = results
            img = np.frombuffer(rgb.tobytes(), dtype=np.uint8)
            self.tex.setRamImage(img)
        return task.cont

    def animate_head(self, task):
        if self.head_joint:
            t = globalClock.getFrameTime()
            angle = 20 * math.sin(t * 2)
            self.head_joint.setHpr(angle, 0, 0)
        return task.cont

    def track_hands_and_animate(self, task):
        results = getattr(self, 'hand_results', None)
        if results and results.multi_hand_landmarks:
            for idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                wrist = hand_landmarks.landmark[self.mp_hands.HandLandmark.WRIST]
                index_base = hand_landmarks.landmark[self.mp_hands.HandLandmark.INDEX_FINGER_MCP]

                dx = index_base.x - wrist.x
                dy = index_base.y - wrist.y

                rot_angle = math.degrees(math.atan2(dy, dx))

                # Mirror left/right based on hand index
                if idx == 0:
                    self.handL_joint.setHpr(rot_angle, 0, 0)
                    self.indexL_joint.setHpr(rot_angle * 1.2, 0, 0)
                elif idx == 1:
                    self.handR_joint.setHpr(-rot_angle, 0, 0)
                    self.indexR_joint.setHpr(-rot_angle * 1.2, 0, 0)

        return task.cont


app = ARHandTrackingDemo()
app.run()