import { useState, useRef, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import Experience from "../components/Experience";
import { MdFullscreen, MdCloseFullscreen, MdVolumeUp } from "react-icons/md";

function AvatarView({animation, text, trigger}) {
  // const [userInput, setUserInput] = useState("");
  // const [manualspeak, setMannualSpeak] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  // 这个 ref 现在用来控制最外层容器
  const mainContainerRef = useRef(null);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      // 让整个大容器全屏，而不是只让 Canvas 全屏
      mainContainerRef.current
        ?.requestFullscreen?.()
        .then(() => setIsFullScreen(true))
        .catch((err) => console.log(err));
    } else {
      document.exitFullscreen?.().then(() => setIsFullScreen(false));
    }
  };

  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullScreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullScreenChange);
  }, []);

  return (
    // 1. 最外层容器：占满屏幕，作为相对定位的基准
    <div
      ref={mainContainerRef}
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        backgroundColor: "#1a1a1a", // 深色背景，防止加载闪烁
        overflow: "hidden",
      }}
    >
      {/* 2. 背景层：3D Canvas (强制绝对定位占满全屏) */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: 0, // 放在最底层
        }}
      >
        <Canvas
          shadows
          camera={{ position: [0, 0, 10], fov: 20 }}
          style={{ height: "100%", width: "100%" }}
        >
          {/* 这里把背景色改成透明或跟随环境，如果你想完全沉浸，可以去掉 color */}
          <color attach="background" args={["#2d2d2d"]} />
          <Experience
           // 1. 传给 AI 用的 (来自 props)
            aiAnimation={animation}
            aiText={text}
            aiTrigger={trigger}

            // // 2. 传给手动输入用的 (来自刚才改名的 state)
            // speakingText={userInput} 
            // speak={manualSpeak} 
            // setSpeak={setManualSpeak}
            />
        </Canvas>
      </div>

      {/* 3. 功能层：全屏按钮 (悬浮在左上角) */}
      <button
        onClick={toggleFullScreen}
        style={{
          position: "absolute",
          top: "20px",
          left: "20px",
          zIndex: 20, // 保证在最上层
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "50%",
          width: "40px",
          height: "40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          backdropFilter: "blur(4px)", // 毛玻璃效果
        }}
        title={isFullScreen ? "Exit Fullscreen" : "Enter Fullscreen"}
      >
        {isFullScreen ? (
          <MdCloseFullscreen size={24} />
        ) : (
          <MdFullscreen size={24} />
        )}
      </button>


      {/* <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          zIndex: 10, // 在 Canvas 之上
          padding: "20px",
          paddingBottom: "40px", // 稍微离底边远一点
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end", // 对齐方式
          background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)", // 底部渐变黑，让文字更清晰，但不会遮挡太多
          boxSizing: "border-box",
          pointerEvents: "none", // 让这层 div 不阻挡鼠标点后面的人
        }}
      >
        <div style={{ 
            display: "flex", 
            width: "100%", 
            maxWidth: "800px", // 限制最大宽度，不要太宽
            pointerEvents: "auto", // 恢复点击
            gap: "10px"
        }}>
          <textarea
            rows={2} // 稍微改小一点高度，看起来更精致
            value={userInput}
            placeholder="Type something to talk..."
            style={{
              flex: 1, // 自动占满剩余空间
              padding: "12px 16px",
              borderRadius: "24px", // 圆角更大，像聊天框
              border: "1px solid rgba(255,255,255,0.1)",
              resize: "none",
              fontSize: "16px",
              backgroundColor: "rgba(30, 30, 30, 0.8)", // 半透明背景
              color: "#fff",
              backdropFilter: "blur(10px)", // 毛玻璃
              outline: "none",
              boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
            }}
            onChange={(e) => setUserInput(e.target.value)}
          />
          <button
            onClick={() => setManualSpeak(true)}
            style={{
              height: "100%",
              minHeight: "50px", // 保证高度和输入框差不多
              padding: "0 24px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "24px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              fontWeight: "600",
              boxShadow: "0 4px 6px rgba(0,0,0,0.2)",
              whiteSpace: "nowrap"
            }}
          >
            <MdVolumeUp size={22} style={{ marginRight: "6px" }} />
            Speak
          </button>
        </div>
      </div> */}
    </div>
  );
}

export default AvatarView;