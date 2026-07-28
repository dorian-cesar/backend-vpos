import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

export interface CdcSearchResult {
  invoiceNumber: string;
  cdc: string;
  detailUrl: string | null;
}

export interface SearchOptions {
  startDate?: string;
  endDate?: string;
  documentType?: string;
  status?: string;
}

class CdcScrapingService {
  private jar: CookieJar;
  private client: AxiosInstance;
  private baseUrl = "https://comercios.bancard.com.py";
  private isSessionActive = false;

  constructor() {
    this.jar = new CookieJar();
    const axiosInstance = axios.create({
      withCredentials: true,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      },
      maxRedirects: 5,
    });
    this.client = wrapper(axiosInstance);
    (this.client.defaults as any).jar = this.jar;
  }

  private async login(): Promise<boolean> {
    try {
      this.isSessionActive = false;
      const user = process.env.BANCARD_COMMERCE_USER || "";
      const pass = process.env.BANCARD_COMMERCE_PASS || "";

      if (!user || !pass) {
        throw new Error("Credenciales de Bancard Commerce no configuradas en .env");
      }

      // 1. Obtener la página del formulario de inicio de sesión
      const loginUrl = `${this.baseUrl}/sessions/new`;
      const loginPageResponse = await this.client.get(loginUrl);

      const html = typeof loginPageResponse.data === "string"
        ? loginPageResponse.data
        : String(loginPageResponse.data || "");
      const $ = cheerio.load(html);

      // Extraer el token CSRF
      const csrfToken =
        $('meta[name="csrf-token"]').attr("content") ||
        $('input[name="authenticity_token"]').val();

      if (!csrfToken) {
        throw new Error("No se pudo obtener el token CSRF para el login.");
      }

      // Identificar la acción del formulario
      const formElem = $("form");
      const formAction = formElem.attr("action") || "/sessions";
      const postUrl = formAction.startsWith("http")
        ? formAction
        : `${this.baseUrl}${formAction}`;

      // Extraer nombres de campos
      const emailFieldName =
        $('input[type="email"]').attr("name") ||
        $('input[name*="email"]').attr("name") ||
        "session[email]";
      const passwordFieldName =
        $('input[type="password"]').attr("name") ||
        $('input[name*="password"]').attr("name") ||
        "session[password]";

      // 2. Enviar credenciales vía POST
      const params = new URLSearchParams();
      params.append("authenticity_token", String(csrfToken));
      params.append(emailFieldName, user);
      params.append(passwordFieldName, pass);
      params.append("commit", "Iniciar Sesión");

      const postResponse = await this.client.post(postUrl, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: loginUrl,
          Origin: this.baseUrl,
        },
      });

      const postHtml = typeof postResponse.data === "string"
        ? postResponse.data
        : String(postResponse.data || "");
      const finalPostUrl = postResponse.request?.res?.responseUrl || postResponse.config?.url || "";

      // Verificar si el inicio de sesión tuvo éxito
      if (
        postHtml.includes("Cerrar Sesión") ||
        postHtml.includes("invoices-table") ||
        finalPostUrl.includes("/invoices-portal") ||
        postResponse.status === 200
      ) {
        this.isSessionActive = true;
        console.log("[CdcScrapingService] ✅ Sesión en portal Comercios Bancard iniciada con éxito.");
        return true;
      }

      throw new Error("No se pudo iniciar sesión. Verifique usuario y contraseña.");
    } catch (error: any) {
      console.error("[CdcScrapingService] ❌ ERROR EN LOGIN:", error.message);
      this.isSessionActive = false;
      throw error;
    }
  }

  private async ensureSession(): Promise<void> {
    if (!this.isSessionActive) {
      await this.login();
      return;
    }

    try {
      const testResponse = await this.client.get(
        `${this.baseUrl}/invoices-portal/invoices?page=1`,
        { maxRedirects: 0 },
      );
      const html = typeof testResponse.data === "string"
        ? testResponse.data
        : String(testResponse.data || "");
      
      if (!html.includes("invoices-table") && !html.includes("Cerrar Sesión")) {
        await this.login();
      }
    } catch (err) {
      await this.login();
    }
  }

  public async findCdcByInvoiceNumber(targetInvoiceNumber: string, options: SearchOptions = {}): Promise<CdcSearchResult | null> {
    await this.ensureSession();

    const cleanTargetNumber = targetInvoiceNumber.trim();
    const {
      startDate = "",
      endDate = "",
      documentType = "1",
      status = "TODOS",
    } = options;

    // Intento 1: Buscar directamente con el parámetro search
    let result = await this.searchInPages(cleanTargetNumber, {
      searchParam: cleanTargetNumber,
      startDate,
      endDate,
      documentType,
      status,
    });

    if (result) return result;

    // Intento 2: Fallback iterando todas las páginas sin el parámetro search
    result = await this.searchInPages(cleanTargetNumber, {
      searchParam: "",
      startDate: startDate || "2000-01-01",
      endDate: endDate || new Date().toISOString().split("T")[0],
      documentType,
      status,
    });

    return result;
  }

  private async searchInPages(targetInvoiceNumber: string, paramsConfig: any): Promise<CdcSearchResult | null> {
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const queryParams = new URLSearchParams({
        page: currentPage.toString(),
        document_type: paramsConfig.documentType || "1",
        status: paramsConfig.status || "TODOS",
      });

      if (paramsConfig.searchParam) queryParams.append("search", paramsConfig.searchParam);
      if (paramsConfig.startDate) queryParams.append("emision_date[start]", paramsConfig.startDate);
      if (paramsConfig.endDate) queryParams.append("emision_date[end]", paramsConfig.endDate);

      const searchUrl = `${this.baseUrl}/invoices-portal/invoices?${queryParams.toString()}`;

      let response;
      try {
        response = await this.client.get(searchUrl);
      } catch (err: any) {
        if (err.response && err.response.status === 401) {
          await this.login();
          response = await this.client.get(searchUrl);
        } else {
          throw err;
        }
      }

      const $ = cheerio.load(response.data as string);

      const paginationContainer = $("[data-pagination-pages-count-value]");
      if (paginationContainer.length > 0) {
        const parsedPages = parseInt(paginationContainer.attr("data-pagination-pages-count-value") || "1", 10);
        if (!isNaN(parsedPages) && parsedPages > 0) {
          totalPages = parsedPages;
        }
      }

      let foundInvoice: CdcSearchResult | null = null;

      $("#invoices-table tbody tr").each((_: any, row: any) => {
        const linkElem = $(row).find('td a[href^="/invoices-portal/invoices/"]');
        const invoiceNumberText = linkElem.text().trim();
        const href = linkElem.attr("href");
        const rowCdc = $(row).attr("data-cdc") || linkElem.attr("data-cdc");

        if (invoiceNumberText === targetInvoiceNumber || invoiceNumberText.includes(targetInvoiceNumber)) {
          let extractedCdc = rowCdc;

          if (!extractedCdc && href) {
            const parts = href.split("/");
            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.length === 44) {
              extractedCdc = lastPart;
            }
          }

          foundInvoice = {
            invoiceNumber: invoiceNumberText,
            cdc: extractedCdc || "",
            detailUrl: href ? `${this.baseUrl}${href}` : null,
          };

          return false;
        }
        return true;
      });

      if (foundInvoice) {
        if ((foundInvoice as CdcSearchResult).detailUrl && !(foundInvoice as CdcSearchResult).cdc) {
          try {
            const detailResponse = await this.client.get((foundInvoice as CdcSearchResult).detailUrl as string);
            const $detail = cheerio.load(detailResponse.data as string);

            const pageCdc =
              $detail("[data-cdc]").attr("data-cdc") ||
              $detail("#cdc").text().trim() ||
              $detail(".cdc").text().trim();

            if (pageCdc) {
              (foundInvoice as CdcSearchResult).cdc = pageCdc;
            }
          } catch (detailErr) {
            // Ignorar error de carga de detalle y usar CDC del link
          }
        }
        return foundInvoice;
      }

      currentPage++;
    }

    return null;
  }
}

export const cdcScrapingService = new CdcScrapingService();
