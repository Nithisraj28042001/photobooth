import gltf
from gltf._loader import GltfLoader
from panda3d.core import LoaderFileTypeRegistry
from direct.showbase.ShowBase import ShowBase
from panda3d.core import AmbientLight, DirectionalLight, Vec4, Texture, CardMaker, PerspectiveLens, WindowProperties
import simplepbr
import cv2
import numpy as np
import os

LoaderFileTypeRegistry.getGlobalPtr().register_deferred_type(GltfLoader)

class App(ShowBase):
    def __init__(self):
        super().__init__()
        simplepbr.init()  # Initialize PBR for better rendering

        # Set up window properties
        props = WindowProperties()
        props.setSize(1280, 720)
        self.win.requestProperties(props)

        # Set up the camera with a wider field of view
        lens = PerspectiveLens()
        lens.setFov(60)
        lens.setNear(0.1)
        lens.setFar(1000)
        self.cam.node().setLens(lens)
        
        # Position camera
        self.camera.set_pos(0, -10, 0)  # Move camera back
        self.camera.look_at(0, 0, 0)    # Look at center
        
        # Setup lights
        ambient = AmbientLight("ambient")
        ambient.setColor(Vec4(0.3, 0.3, 0.3, 1))
        d = DirectionalLight("directional")
        d.setColor(Vec4(1, 1, 1, 1))
        d.setDirection((-1, -1, -2))
        self.render.setLight(self.render.attach_new_node(ambient))
        self.render.setLight(self.render.attach_new_node(d))

        # Load and position the model
        model = self.loader.loadModel("wolverine.glb")
        model.reparentTo(self.render)
        model.setScale(0.5)
        model.setPos(0, 10, 0)
        model.setHpr(0, 0, 90)  # Rotate 90 degrees around Z axis

        # Webcam background
        self.cap = cv2.VideoCapture(1)
        ret, frame = self.cap.read()
        if ret:
            height, width = frame.shape[:2]
            self.tex = Texture()
            self.tex.setup2dTexture(width, height, Texture.TUnsignedByte, Texture.FRgb)
            
            cm = CardMaker('bg')
            cm.set_frame_fullscreen_quad()
            self.bg = self.render2d.attach_new_node(cm.generate())
            self.bg.set_texture(self.tex)
            self.task_mgr.add(self.update_webcam, "WebcamTask")
        else:
            print("Failed to initialize webcam")

    def update_webcam(self, task):
        ret, frame = self.cap.read()
        if ret:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = np.flipud(frame)
            frame = np.ascontiguousarray(frame)
            self.tex.set_ram_image(frame)
        return task.cont

    def destroy(self):
        self.cap.release()
        super().destroy()

app = App()
app.run()
