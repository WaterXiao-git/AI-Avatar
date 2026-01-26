import { Environment, useTexture } from "@react-three/drei";
import { Avatar } from "./Avatar";
import { useThree } from "@react-three/fiber";
import { TEXTURE_PATH } from "../constant";
import PropTypes from "prop-types";

const Experience = ({ aiAnimation, aiText, aiTrigger, speakingText, speak, setSpeak }) => {
  const texture = useTexture(TEXTURE_PATH);
  const viewport = useThree((state) => state.viewport);

  return (
    <>
      {/* <OrbitControls /> */}{" "}
      {/** OrbitControls is Allows the user to control the camera with the mouse or touch */}

      {/* 下面的是既要输入框又要语音的代码，先以不带输入框的来测试 */}
      {/* <Avatar
        animation={aiAnimation}
        text={aiTrigger ? aiText : speakingText}
        speak={aiTrigger ? true : speak}
        trigger={aiTrigger}
        setSpeak={setSpeak}
      />{" "} */}

      {/*下面是只要语音的代码*/}
      <Avatar
        position={[0, -5, 5]}
        scale={3}
        animation={aiAnimation}
        text={aiText}
        trigger={aiTrigger}
        speak={!!aiTrigger}
        />
      {/* Position [] take three values first is x, second is y, third is z. This is use to change the view of avatar and scale is use to handle avatar zoom */}
      <Environment preset="sunset" />{" "}
      {/*Adds realistic lighting & reflections. */}
      <mesh>
        <planeGeometry args={[viewport.width, viewport.height]} />
        <meshBasicMaterial map={texture} />
      </mesh>
    </>
  );
};

Experience.propTypes = {
  // speakingText: PropTypes.string.isRequired,
  // speak: PropTypes.bool.isRequired,
  // setSpeak: PropTypes.func.isRequired,
  aiAnimation: PropTypes.string,
  aiText: PropTypes.string,
  aiTrigger: PropTypes.number,
};

export default Experience;
