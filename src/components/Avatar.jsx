import React, { useEffect, useRef, useState } from 'react'
import { useGraph, useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from "three";

export function Avatar(props) {
  // --- 1. 你刚才调好的固定参数 ---
  // 注意：这里优先级最高，会忽略 Experience 传过来的参数
  const FIXED_POSITION = [0, 1.25, -1.0]; 
  const FIXED_SCALE = 0.005; 

  const group = useRef()
  const { scene, animations } = useGLTF('/models/Pi_1.glb')
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes, materials } = useGraph(clone)
  const { actions } = useAnimations(animations, group)
  
  // 用于控制嘴巴张合的简单状态
  const [isTalking, setIsTalking] = useState(false);

  // --- 2. 核心逻辑：文字转语音 (TTS) ---
  useEffect(() => {
    // 如果 props.speak 变成 true，且有文字
    if (props.speak && props.text) {
      console.log("尝试朗读:", props.text);
      
      // 使用浏览器自带语音
      const utterance = new SpeechSynthesisUtterance(props.text);
      
      // 选一个英文声音 (可选)
      const voices = window.speechSynthesis.getVoices();
      utterance.voice = voices.find(v => v.lang.includes('en')) || voices[0];
      
      // 开始说话时
      utterance.onstart = () => {
        setIsTalking(true);
      };
      
      // 说完时
      utterance.onend = () => {
        setIsTalking(false);
        if (props.setSpeak && typeof props.setSpeak === 'function') {
            props.setSpeak(false); 
        } // 告诉父组件说完了
      };

      // 播放
      window.speechSynthesis.cancel(); // 先打断之前的
      window.speechSynthesis.speak(utterance);
    }
  }, [props.speak, props.text, props.setSpeak]);

  // --- 3. 动画控制 ---
  const animationName = props.animation || "Idle"; 
  useEffect(() => {
    const action = actions[animationName] || actions[Object.keys(actions)[0]];
    if (action) {
      action.reset().fadeIn(0.5).play();
      return () => action.fadeOut(0.5);
    }
  }, [animationName, actions]);

  // --- 4. 嘴型控制 (模拟) ---
  useFrame((state) => {
    const headMesh = nodes.char1; 
    
    // 只有在说话状态(isTalking)下才动嘴
    if (isTalking && headMesh.morphTargetDictionary) {
        // 尝试找各种常见的嘴型命名
        const jawIndex = headMesh.morphTargetDictionary["jawOpen"] 
                      ?? headMesh.morphTargetDictionary["mouthOpen"]
                      ?? headMesh.morphTargetDictionary["MouthOpen"]
                      ?? headMesh.morphTargetDictionary["v_aa"]; // ReadyPlayerMe 常用

        if (jawIndex !== undefined) {
            // 用正弦波模拟张嘴闭嘴 (说话的样子)
            const speed = 20;
            const amount = (Math.sin(state.clock.elapsedTime * speed) + 1) * 0.3; 
            
            headMesh.morphTargetInfluences[jawIndex] = THREE.MathUtils.lerp(
                headMesh.morphTargetInfluences[jawIndex],
                amount,
                0.5
            );
        } else {
            // 如果控制台打印这句话，说明你的模型真的没有做嘴巴
            // console.warn("未找到嘴型 MorphTargets");
        }
    } else if (headMesh.morphTargetDictionary) {
        // 不说话时闭嘴
        const jawIndex = headMesh.morphTargetDictionary["jawOpen"] ?? headMesh.morphTargetDictionary["mouthOpen"];
        if (jawIndex !== undefined) {
             headMesh.morphTargetInfluences[jawIndex] = 0;
        }
    }
  });

  // --- 5. 诊断代码 ---
  useEffect(() => {
     if (nodes.char1.morphTargetDictionary) {
         console.log("恭喜！你的模型包含以下表情键:", Object.keys(nodes.char1.morphTargetDictionary));
     } else {
         console.error("注意：你的模型 'char1' 没有 morphTargetDictionary。它无法张嘴。");
         console.log("模型节点结构:", nodes);
     }
  }, [nodes]);

  return (
    <group {...props} dispose={null}>
      <group name="Scene">
        <group 
            name="Armature" 
            position={FIXED_POSITION} 
            rotation={[0, 0, 0]} 
            scale={FIXED_SCALE} 
        > 
          <primitive object={nodes.Hips} />
          <skinnedMesh 
            name="char1" 
            geometry={nodes.char1.geometry} 
            material={materials.Material_1} 
            skeleton={nodes.char1.skeleton} 
            morphTargetDictionary={nodes.char1.morphTargetDictionary}
            morphTargetInfluences={nodes.char1.morphTargetInfluences}
          />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/Pi_1.glb')
export default Avatar;