import os
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
BAIDU_MAP_AK = os.getenv("BAIDU_MAP_AK", "")
ALLOW_ORIGINS = os.getenv("ALLOW_ORIGINS", "http://localhost:5276").split(",")

# 图片文字识别（火山引擎方舟视觉模型，用于对话面板图片提问）。未配置时接口优雅降级
VISION_API_KEY = os.getenv("VISION_API_KEY", "")
VISION_BASE_URL = os.getenv("VISION_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
VISION_MODEL = os.getenv("VISION_MODEL", "doubao-seed-2-0-mini-260428")
