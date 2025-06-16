import gltf
from gltf._loader import GltfLoader
from panda3d.core import LoaderFileTypeRegistry

LoaderFileTypeRegistry.getGlobalPtr().register_deferred_type(GltfLoader)

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

        model = self.loader.loadModel("wolverine.glb")
        model.reparentTo(self.render)
        model.setScale(0.5)
        model.setPos(0, 1, 0)
        model.setHpr(0,0,0)

app = TestApp()
app.run()
