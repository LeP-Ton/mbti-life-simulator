import expImplementation from "@stdlib/math-base-special-exp";
import logImplementation from "@stdlib/math-base-special-ln";
import cosImplementation from "@stdlib/math-base-special-cos";
import powImplementation from "@stdlib/math-base-special-pow";
import sqrtImplementation from "@stdlib/math-base-special-sqrt";

// 原生超越函数在不同 V8 版本中可相差末位；使用同一份锁版本的实现，保留双精度计算。
// 这里不对人物状态或概率作显示性舍入。平方根使用库指定的 IEEE-754 原语。
export const exp = expImplementation;
export const ln = logImplementation;
export const cos = cosImplementation;
export const pow = powImplementation;
export const sqrt = sqrtImplementation;
