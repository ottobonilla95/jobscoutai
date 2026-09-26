import {translate} from '@core/i18n';
import {brand} from '@core/brand';
import type {Metadata} from 'next';
import {requestLanguage} from '@/lib/language';
import {I18nProvider} from '@/components/i18n';
import './globals.css';
export async function generateMetadata():Promise<Metadata>{const {locale}=await requestLanguage();return {applicationName:brand.name,title:translate(locale,'{productName} — Your next chapter'),description:locale==='es'?'Tu búsqueda privada de oportunidades profesionales.':'Your private search for professional opportunities.',robots:{index:false,follow:false}};}
export default async function RootLayout({children}:{children:React.ReactNode}){const language=await requestLanguage();return <html lang={language.locale}><body><I18nProvider initial={language}>{children}</I18nProvider></body></html>;}
