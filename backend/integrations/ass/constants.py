ASS_SANDBOX_BASE_URL = "https://kiiraytest.lasecu-assurances.sn"
ASS_API_PARTNER_SEGMENT = "partner"
ASS_API_PREFIX = f"/api/v1/{ASS_API_PARTNER_SEGMENT}"

ASS_ENDPOINT_RC_AUTO = "/rc.request"
ASS_ENDPOINT_ISSUE_AUTO = "/qrcode.request"
ASS_ENDPOINT_CANCEL_ATTESTATION = "/qrcode.mono.cancel"  # PDF officiel (primaire)
ASS_ENDPOINT_CANCEL_ATTESTATION_FALLBACK = "/qrcode.cancel"  # Postman (repli sur 404)
ASS_ENDPOINT_RC_MOTO = "/rc.moto"
ASS_ENDPOINT_ISSUE_MOTO = "/moto.request"
ASS_ENDPOINT_RC_FLEET = "/rc.flotte.request"
ASS_ENDPOINT_ISSUE_FLEET = "/qrcode.flotte.request"
ASS_ENDPOINT_RC_TRAILER = "/remorque.rc.request"
ASS_ENDPOINT_ISSUE_TRAILER = "/remorque.qrcode.request"
ASS_ENDPOINT_RC_BUS = "/bus.ecole.rc"
ASS_ENDPOINT_ISSUE_BUS = "/bus.ecole.request"
ASS_ENDPOINT_RC_GARAGE = "/rc.garage"
ASS_ENDPOINT_ISSUE_GARAGE = "/garage.request"
ASS_ENDPOINT_STOCK_QR = "/stock.qr"
ASS_ENDPOINT_VERIFY_REGISTRATION = "/verif.immatriculation"

ASS_POLICY_FEE = 3000

ASS_SUCCESS_STATUS = "SUCCESS"

ASS_CANCEL_METHODS = {"ANNULER", "RESILIER", "SUSPENDRE"}
