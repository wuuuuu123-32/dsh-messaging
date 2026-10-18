// Host 侧保持惰性：标记数据只保存在浏览器 localStorage，客户端负责界面。
export const name = 'dsh-messaging'
export const inject = []

export function apply() {
  // 客户端 bundle 会写入 data-messaging 属性作为加载自证；host 不做副作用。
}
