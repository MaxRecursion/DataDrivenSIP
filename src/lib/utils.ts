// cn/lite joins class names without resolving Tailwind conflicts (0.2 KB instead of 10.7 KB).
// So components never override one of their own default utilities through `className`.
export { default as cn } from "cn/lite";
