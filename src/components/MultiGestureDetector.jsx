import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";

// 骨架连接定义
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], 
  [0, 5], [5, 6], [6, 7], [7, 8], 
  [0, 9], [9, 10], [10, 11], [11, 12], 
  [0, 13], [13, 14], [14, 15], [15, 16], 
  [0, 17], [17, 18], [18, 19], [19, 20], 
  [5, 9], [9, 13], [13, 17] 
];

const GestureDetector = ({ onGreet, isSessionActive }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const gestureRecognizer = useRef(null);
  const requestRef = useRef(null);
  const [debugStatus, setDebugStatus] = useState("初始化中...");

  // 挥手状态
  const waveState = useRef({
    prevX: 0,           
    prevDirection: 0,   
    inflectionCounts: 0, 
    lastInflectionTime: 0,
    lastOpenPalmTime: 0 
  });
  
  const isCoolingDown = useRef(false);

  useEffect(() => {
    const loadModel = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );
      gestureRecognizer.current = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/gesture_recognizer.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        // 🟢 关键修改：允许同时检测 4 只手，防止人多时把主角漏了
        numHands: 4, 
      });
      setModelLoaded(true);
    };
    loadModel();
  }, []);

  const drawSkeleton = (ctx, landmarks, width, height, isPrimary) => {
    // 🟢 主角用绿色+红色，路人用灰色
    ctx.strokeStyle = isPrimary ? "#00FF00" : "#888888"; 
    ctx.lineWidth = isPrimary ? 3 : 1;
    ctx.fillStyle = isPrimary ? "#FF0000" : "#CCCCCC"; 
    
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-width, 0);

    HAND_CONNECTIONS.forEach(([start, end]) => {
      const p1 = landmarks[start];
      const p2 = landmarks[end];
      ctx.beginPath();
      ctx.moveTo(p1.x * width, p1.y * height);
      ctx.lineTo(p2.x * width, p2.y * height);
      ctx.stroke();
    });

    landmarks.forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, isPrimary ? 4 : 2, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  };

  // --- 挥手检测逻辑 (保持之前优化的版本) ---
  const detectWaveAction = (wristX, categoryName) => {
    const now = Date.now();
    const state = waveState.current;
    
    if (categoryName === "Open_Palm") state.lastOpenPalmTime = now;
    const isTechnicallyOpenPalm = (now - state.lastOpenPalmTime < 500);

    if (!isTechnicallyOpenPalm) {
        if (now - state.lastInflectionTime > 1000) {
            state.inflectionCounts = 0;
            state.prevDirection = 0;
        }
        state.prevX = wristX;
        return false;
    }

    const velocity = wristX - state.prevX;
    if (Math.abs(velocity) > 0.01) {
        const currentDirection = velocity > 0 ? 1 : -1;
        if (state.prevDirection !== 0 && currentDirection !== state.prevDirection) {
            state.inflectionCounts++;
            state.lastInflectionTime = now;
        }
        state.prevDirection = currentDirection;
    }
    state.prevX = wristX;

    if (state.inflectionCounts >= 3 && !isCoolingDown.current) {
        if (now - state.lastInflectionTime < 1000) {
            return true; 
        } else {
            state.inflectionCounts = 0;
        }
    }
    return false;
  };

  const predict = () => {
    if (isSessionActive) {
       setDebugStatus("会话锁定中 (排他模式)");
       if(canvasRef.current) {
         const ctx = canvasRef.current.getContext("2d");
         ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
       }
       requestRef.current = requestAnimationFrame(predict);
       return;
    }

    if (webcamRef.current?.video?.readyState === 4 && gestureRecognizer.current) {
      const video = webcamRef.current.video;
      const { videoWidth, videoHeight } = video;
      
      if (canvasRef.current) {
        canvasRef.current.width = videoWidth;
        canvasRef.current.height = videoHeight;
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, videoWidth, videoHeight);

      const results = gestureRecognizer.current.recognizeForVideo(video, Date.now());
      
      // 🟢 多人筛选逻辑
      if (results.landmarks.length > 0) {
        let bestHandIndex = -1;
        let maxScore = -1;

        // 1. 遍历所有的手，寻找“C位”
        for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            const wristX = landmarks[0].x; // 0-1
            const wristY = landmarks[0].y;
            
            // 计算分数：越靠近中间(0.5)分越高 + 越靠上分越高
            const distFromCenter = Math.abs(wristX - 0.5);
            // 分数公式：中心权重(最大100)
            const centralityScore = (0.5 - distFromCenter) * 200; 
            
            // 简单筛选：必须在中间区域，且高度合适
            if (wristX > 0.15 && wristX < 0.85 && wristY < 0.8) {
                if (centralityScore > maxScore) {
                    maxScore = centralityScore;
                    bestHandIndex = i;
                }
            }
        }

        // 2. 处理绘制和检测
        for (let i = 0; i < results.landmarks.length; i++) {
            const isPrimary = (i === bestHandIndex);
            
            // 绘制骨架 (主角亮色，其他人暗色)
            if (ctx) drawSkeleton(ctx, results.landmarks[i], videoWidth, videoHeight, isPrimary);

            // 🟢 只对主角进行挥手检测
            if (isPrimary) {
                const gesture = results.gestures[i][0];
                const wristX = results.landmarks[i][0].x;
                
                setDebugStatus(`监测主体 | 动作: ${gesture.categoryName} | 摆动: ${waveState.current.inflectionCounts}`);
                
                const isWaving = detectWaveAction(wristX, gesture.categoryName);
                if (isWaving) {
                    console.log("👋 主体挥手触发交互！");
                    onGreet();
                    
                    waveState.current.inflectionCounts = 0;
                    isCoolingDown.current = true;
                    setTimeout(() => isCoolingDown.current = false, 4000);
                }
            }
        }
        
        if (bestHandIndex === -1) {
            setDebugStatus("未检测到有效区域内的主体");
            waveState.current.inflectionCounts = 0; // 没人时重置
        }

      } else {
        setDebugStatus("无人");
        waveState.current.inflectionCounts = 0;
      }
    }
    requestRef.current = requestAnimationFrame(predict);
  };

  useEffect(() => {
    if (modelLoaded) requestRef.current = requestAnimationFrame(predict);
    return () => cancelAnimationFrame(requestRef.current);
  }, [modelLoaded, isSessionActive]);

  return (
    <div style={{ position: "absolute", bottom: 20, right: 20, zIndex: 9999, width: "160px" }}>
      <div style={{ position: "relative" }}>
        <Webcam 
            ref={webcamRef} 
            style={{ width: "100%", borderRadius: "10px", opacity: isSessionActive ? 0.2 : 1, display: "block" }} 
            mirrored={true} 
        />
        <canvas
            ref={canvasRef}
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        />
      </div>
      <div style={{ textAlign: "center", fontSize: "10px", color: "white", textShadow: "1px 1px 2px black" }}>
        {debugStatus}
      </div>
    </div>
  );
};

export default MultiGestureDetector;