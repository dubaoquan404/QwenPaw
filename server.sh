#!/usr/bin/env bash
# 开发环境后端启动脚本
# 用法: ./server.sh {start|stop|restart} [--host HOST] [--port PORT] [--log-level LEVEL]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="${SCRIPT_DIR}/.server.pid"

# 默认参数
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8088}"
LOG_LEVEL="${LOG_LEVEL:-info}"

usage() {
    echo "用法: $0 {start|stop|restart} [--host HOST] [--port PORT] [--log-level LEVEL]"
    exit 1
}

# 第一个参数为子命令
COMMAND="${1:-start}"
shift || true

# 解析剩余参数
while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)       HOST="$2";      shift 2 ;;
        --port)       PORT="$2";      shift 2 ;;
        --log-level)  LOG_LEVEL="$2"; shift 2 ;;
        *)
            echo "未知参数: $1"
            usage
            ;;
    esac
done

cd "$SCRIPT_DIR"

# 激活虚拟环境（如果存在）
if [[ -f ".venv/bin/activate" ]]; then
    source .venv/bin/activate
elif [[ -f "venv/bin/activate" ]]; then
    source venv/bin/activate
fi

do_start() {
    if [[ -f "$PID_FILE" ]]; then
        PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "服务已在运行 (PID=${PID})，请先执行 stop 或使用 restart"
            exit 1
        else
            rm -f "$PID_FILE"
        fi
    fi

    echo "启动后端服务: http://${HOST}:${PORT}  (log-level=${LOG_LEVEL})"

    # 必须用 -m 模块方式启动，直接运行文件会因相对导入报错：
    #   ImportError: attempted relative import with no known parent package
    # PYTHONPATH 确保 src/ 下的包可被 Python 找到
    PYTHONPATH="${SCRIPT_DIR}/src" python -m qwenpaw app \
        --host "$HOST" \
        --port "$PORT" \
        --log-level "$LOG_LEVEL" \
        --reload &

    echo $! > "$PID_FILE"
    echo "服务已启动 (PID=$(cat "$PID_FILE"))"
}

do_stop() {
    if [[ ! -f "$PID_FILE" ]]; then
        echo "PID 文件不存在，服务可能未运行"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "停止服务 (PID=${PID})..."
        kill "$PID"
        # 等待进程退出，最多 10 秒
        for i in $(seq 1 10); do
            kill -0 "$PID" 2>/dev/null || break
            sleep 1
        done
        kill -0 "$PID" 2>/dev/null && kill -9 "$PID" || true
        echo "服务已停止"
    else
        echo "进程 ${PID} 不存在，清理 PID 文件"
    fi
    rm -f "$PID_FILE"
}

case "$COMMAND" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_stop
        sleep 1
        do_start
        ;;
    *)
        usage
        ;;
esac