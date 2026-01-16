import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth-config'
console.log('Providers at runtime:', authOptions.providers)
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
