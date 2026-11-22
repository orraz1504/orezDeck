// Lets plain Node run the app's TypeScript (extensionless relative imports → .ts).
// Used by `npm run simulate`.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (e) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context)
      throw e
    }
  },
})
