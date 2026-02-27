import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export default function ModelPreview({ modelUrl }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current || !modelUrl) {
      return undefined;
    }

    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(2.2, 1.5, 2.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight("#ffffff", "#d9ecff", 1.0));
    const key = new THREE.DirectionalLight("#ffffff", 1.2);
    key.position.set(4, 5, 4);
    scene.add(key);

    const fill = new THREE.DirectionalLight("#9ecaff", 0.6);
    fill.position.set(-3, 4, -2);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(4, 64),
      new THREE.MeshStandardMaterial({ color: "#e5f4ff", roughness: 0.88, metalness: 0.03 }),
    );
    ground.rotation.x = -Math.PI * 0.5;
    ground.position.y = -0.01;
    scene.add(ground);

    let disposed = false;
    let model = null;

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          return;
        }
        model = gltf.scene;
        scene.add(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        model.position.sub(center);
        model.position.y -= box.min.y;

        const radius = Math.max(size.length() * 0.5, 0.6);
        camera.position.set(radius * 1.4, radius * 0.95, radius * 1.6);
        controls.target.set(0, radius * 0.5, 0);
        controls.update();
      },
      undefined,
      () => {},
    );

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) {
        return;
      }
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (model) {
        scene.remove(model);
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  return <div className="model-preview" ref={mountRef} />;
}
