import gltf
from gltf._loader import GltfLoader
from panda3d.core import LoaderFileTypeRegistry
import time

LoaderFileTypeRegistry.getGlobalPtr().register_deferred_type(GltfLoader)
from direct.actor.Actor import Actor
from direct.showbase.ShowBase import ShowBase
from panda3d.core import AmbientLight, DirectionalLight, Vec4
import simplepbr  # optional, but recommended

class TestApp(ShowBase):
    
    def __init__(self):
        super().__init__()
        simplepbr.init()  # if using PBR

        # Setup lights
        ambient = AmbientLight("ambient")
        ambient.setColor(Vec4(0.3,0.3,0.3,1))
        d = DirectionalLight("directional")
        d.setColor(Vec4(1,1,1,1))
        d.setDirection((-1,-1,-2))
        self.render.setLight(self.render.attach_new_node(ambient))
        self.render.setLight(self.render.attach_new_node(d))

        # model = self.loader.loadModel("wolverine.glb")
        # model.reparentTo(self.render)
        model = Actor("Demon3_Low_Poly.glb")
        model.reparentTo(self.render)
        joint_names = [j.getName() for j in model.getJoints()]
        print(joint_names)

        # for name in joint_names:
        #     joint_np = model.exposeJoint(None, 'modelRoot', name)
        #     # Create a small sphere to represent the joint
        #     marker = self.loader.loadModel("models/misc/sphere")  # Panda3D includes this by default
        #     marker.setScale(0.1)
        #     marker.setColor(1, 1, 1, 1)  # Red
        #     marker.reparentTo(joint_np)

        model.setScale(0.5)
        model.setPos(0, 2, 0)
        model.setHpr(0,0,0)
        model.getJoints()

        joint_np = model.controlJoint(None, 'modelRoot', 'Head')


        joint_np.setHpr(45,0,0)



app = TestApp()
app.run()
