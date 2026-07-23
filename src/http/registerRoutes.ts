import { TokenService } from "../auth/tokenService";
import { loginSchema } from "../schemas/loginSchema";
import { AuthService } from "../service/authService";
import { parseJsonBody } from "./middleware/parseJsonBody";
import { validateBody } from "./middleware/validateBody";
import { HttpRouter } from "./router/router";

interface RegisterRoutesOptions {
    router: HttpRouter;
    authService: AuthService;
    tokenService: TokenService;
}


export function registerRoutes(options: RegisterRoutesOptions): void {
    const { router, authService, tokenService } = options

    router.post("/login", {
        middleware: [
            parseJsonBody(), validateBody(loginSchema)
        ],
        handler: createLoginHandler({

        })
    })
}