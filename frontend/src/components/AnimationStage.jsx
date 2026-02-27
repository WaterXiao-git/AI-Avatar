import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { toAbsoluteUrl } from "../lib/config";

export default function AnimationStage({ animations, selectedAnimation, onSelect }) {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current || !selectedAnimation) {
      return undefined;
    }

    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 3.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;

    scene.add(new THREE.HemisphereLight("#fff", "#d6e9ff", 1.2));
    const key = new THREE.DirectionalLight("#fff", 1.1);
    key.position.set(4, 6, 3);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64),
      new THREE.MeshStandardMaterial({ color: "#eaf6ff", roughness: 0.9, metalness: 0.02 }),
    );
    floor.rotation.x = -Math.PI * 0.5;
    floor.position.y = -0.02;
    scene.add(floor);

    const loader = new FBXLoader();
    const clock = new THREE.Clock();

    let mixer = null;
    let avatar = null;
    let disposed = false;

    loader.load("/models/avatar.fbx", (model) => {
      if (disposed) {
        return;
      }
      avatar = model;
      avatar.scale.setScalar(0.01);
      avatar.position.set(0, 0, 0);
      scene.add(avatar);

      loader.load(toAbsoluteUrl(selectedAnimation.file_url), (animFbx) => {
        if (disposed || !avatar) {
          return;
        }
        const clip = animFbx.animations?.[0];
        if (!clip) {
          return;
        }
        mixer = new THREE.AnimationMixer(avatar);
        const action = mixer.clipAction(clip);
        action.reset();
        action.play();
      });
    });

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      mixer?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("resize", onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      if (avatar) {
        scene.remove(avatar);
      }
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [selectedAnimation]);

  return (
    <section className="animation-stage-wrap">
      <div className="animation-list">
        {animations.map((anim) => (
          <button
            key={anim.file_name}
            type="button"
            onClick={() => onSelect(anim)}
            className={selectedAnimation?.file_name === anim.file_name ? "anim-btn active" : "anim-btn"}
          >
            {anim.display_name}
          </button>
        ))}
      </div>
      <div className="animation-stage" ref={mountRef} />
    </section>
  );
}
