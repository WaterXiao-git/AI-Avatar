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
  const [debugStatus, setDebugStatus] = useState("未检测到手");

  // --- 🌊 挥手识别专用状态 ---
  const waveState = useRef({
    prevX: 0,           
    prevDirection: 0,   
    inflectionCounts: 0, 
    lastInflectionTime: 0,
    // 🟢 新增：最后一次看到 Open_Palm 的时间
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
        numHands: 1,
      });
      setModelLoaded(true);
    };
    loadModel();
  }, []);

  // 辅助：绘制骨架
  const drawSkeleton = (ctx, landmarks, width, height) => {
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = "#00FF00"; 
    ctx.lineWidth = 2;
    ctx.fillStyle = "#FF0000"; 
    
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
      ctx.arc(point.x * width, point.y * height, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.restore();
  };

  // --- 🌊 核心逻辑：动态挥手检测 (优化版) ---
  const detectWaveAction = (wristX, categoryName) => {
    const now = Date.now();
    const state = waveState.current;
    
    // 1. 记忆机制：如果当前检测到了 Open_Palm，更新记忆时间
    if (categoryName === "Open_Palm") {
        state.lastOpenPalmTime = now;
    }

    // 2. 宽容判定：
    // 如果当前是 Open_Palm，或者 过去 500ms 内出现过 Open_Palm
    // 我们都认为这是一个有效的挥手动作过程 (解决了挥手太快看不清手势的问题)
    const isTechnicallyOpenPalm = (now - state.lastOpenPalmTime < 500);

    if (!isTechnicallyOpenPalm) {
        // 真的太久没张开手了，或者手放下了，才重置
        if (now - state.lastInflectionTime > 1000) {
            state.inflectionCounts = 0;
            state.prevDirection = 0;
        }
        state.prevX = wristX;
        return false;
    }

    // 3. 计算速度
    const velocity = wristX - state.prevX;
    
    // 4. 阈值设定 (快速挥手时，移动距离其实很大，所以这里不需要设得太小)
    const MOVEMENT_THRESHOLD = 0.01; 

    if (Math.abs(velocity) > MOVEMENT_THRESHOLD) {
        const currentDirection = velocity > 0 ? 1 : -1;

        // 判定反转
        if (state.prevDirection !== 0 && currentDirection !== state.prevDirection) {
            state.inflectionCounts++;
            state.lastInflectionTime = now;
            console.log(`🌊 极速挥手 - 反转: ${state.inflectionCounts}`);
        }
        
        state.prevDirection = currentDirection;
    }

    state.prevX = wristX;

    // 5. 触发条件：
    // 次数 >= 3 且不在冷却中
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
       setDebugStatus("会话中 (视觉暂停)");
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

      const results = gestureRecognizer.current.recognizeForVideo(video, Date.now());
      
      if (results.gestures.length > 0 && results.landmarks.length > 0) {
        const gesture = results.gestures[0][0];
        const landmarks = results.landmarks[0]; 
        
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) drawSkeleton(ctx, landmarks, videoWidth, videoHeight);

        const wristX = landmarks[0].x;
        const wristY = landmarks[0].y;
        
        const isCenter = wristX > 0.15 && wristX < 0.85;
        const isHighEnough = wristY < 0.8; 

        // 调试信息
        let statusMsg = `动作:${gesture.categoryName} | 摆动:${waveState.current.inflectionCounts}`;
        
        // 🟢 如果正在利用“记忆”机制，给个提示
        if (gesture.categoryName !== "Open_Palm" && (Date.now() - waveState.current.lastOpenPalmTime < 500)) {
            statusMsg += " (模糊容错中)";
        }

        if (!isCenter) statusMsg = "位置偏离";
        if (!isHighEnough) statusMsg = "请举起手";
        setDebugStatus(statusMsg);

        // 逻辑入口
        if (isCenter && isHighEnough) {
            // 🟢 直接传入坐标和手势，逻辑判断在函数内部处理
            const isWaving = detectWaveAction(wristX, gesture.categoryName);
            
            if (isWaving) {
                console.log("👋 识别到动态挥手！触发交互！");
                onGreet();
                
                waveState.current.inflectionCounts = 0;
                isCoolingDown.current = true;
                setTimeout(() => { 
                    isCoolingDown.current = false; 
                    console.log("🟢 冷却结束");
                }, 4000);
            }
        } else {
            // 如果位置完全不对（比如手放下了），才重置
            // 这里不要急着重置，防止挥手幅度太大出界
            // waveState.current.inflectionCounts = 0; 
        }

      } else {
        setDebugStatus("未检测到手");
        // 如果手彻底消失超过 1秒，才重置
        if (Date.now() - waveState.current.lastInflectionTime > 1000) {
            waveState.current.inflectionCounts = 0;
        }
        
        if(canvasRef.current) {
            const ctx = canvasRef.current.getContext("2d");
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }
    requestRef.current = requestAnimationFrame(predict);
  };

  useEffect(() => {
    if (modelLoaded) {
      requestRef.current = requestAnimationFrame(predict);
    }
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
        {!isSessionActive && (
          <div style={{ position: "absolute", top: "0%", left: "15%", width: "70%", height: "85%", border: "2px dashed rgba(0,255,0,0.5)", borderRadius: "10px", pointerEvents: "none", boxSizing: "border-box" }}></div>
        )}
      </div>
      <div style={{ textAlign: "center", fontSize: "10px", color: "white", textShadow: "1px 1px 2px black" }}>
        {isSessionActive ? "💬 会话中..." : debugStatus}
      </div>
    </div>
  );
};

export default GestureDetector;