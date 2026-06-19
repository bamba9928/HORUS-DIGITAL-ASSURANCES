import pytest
import requests
from django.test import override_settings

from integrations.ass.client import AssClient
from integrations.ass.exceptions import (
    AssApiError,
    AssConfigurationError,
    AssRealCallsDisabledError,
)


class FakeAssResponse:
    def __init__(self, payload=None, status_code=200, text=""):
        self.payload = payload or {"operationStatus": "SUCCESS", "data": 123}
        self.status_code = status_code
        self.text = text

    def json(self):
        if self.payload is None:
            raise ValueError("No JSON")
        return self.payload


class FakeAssSession:
    def __init__(self, response=None, error=None):
        self.calls = []
        self.response = response or FakeAssResponse()
        self.error = error

    def post(self, url, *, json, auth, timeout):
        self.calls.append(
            {
                "url": url,
                "json": json,
                "auth": auth,
                "timeout": timeout,
            }
        )
        if self.error is not None:
            raise self.error
        return self.response


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_stock_qr_uses_confirmed_sandbox_partner_segment_and_post():
    session = FakeAssSession()
    client = AssClient(session=session)

    response = client.stock_qr({"code": "1000"})

    assert response["operationStatus"] == "SUCCESS"
    assert session.calls == [
        {
            "url": "https://kiiraytest.lasecu-assurances.sn/api/v1/partner/stock.qr",
            "json": {"code": "1000"},
            "auth": ("ass", "secret-test"),
            "timeout": 30,
        }
    ]


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_moto_rc_uses_post_endpoint_confirmed_by_ass():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.calculate_moto_rc({"cylindre": 125})

    assert session.calls[0]["url"].endswith("/api/v1/partner/rc.moto")
    assert session.calls[0]["json"] == {"cylindre": 125}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_fleet_rc_request_uses_post_endpoint_confirmed_by_ass():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.calculate_fleet_rc({"requests": [{"requestId": "veh-1"}]})

    assert session.calls[0]["url"].endswith("/api/v1/partner/rc.flotte.request")
    assert session.calls[0]["json"] == {"requests": [{"requestId": "veh-1"}]}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_trailer_issue_uses_pdf_endpoint():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.issue_trailer_contract({"referenceTrxPartner": "REM-1"})

    assert session.calls[0]["url"].endswith("/api/v1/partner/remorque.qrcode.request")
    assert session.calls[0]["json"] == {"referenceTrxPartner": "REM-1"}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_verify_registration_uses_postman_endpoint():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.verify_registration({"immatriculation": "AA-917-XQ"})

    assert session.calls[0]["url"].endswith("/api/v1/partner/verif.immatriculation")
    assert session.calls[0]["json"] == {"immatriculation": "AA-917-XQ"}


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=False,
)
def test_real_ass_calls_remain_disabled_by_default_guard():
    client = AssClient(session=FakeAssSession())

    with pytest.raises(AssRealCallsDisabledError, match="desactives"):
        client.stock_qr()


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="",
    ASS_PASSWORD="",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_real_ass_calls_require_basic_auth_credentials():
    client = AssClient(session=FakeAssSession())

    with pytest.raises(AssConfigurationError, match="ASS_USERNAME et ASS_PASSWORD"):
        client.stock_qr()


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_http_error_raises_ass_api_error_with_ass_message():
    session = FakeAssSession(
        response=FakeAssResponse(
            payload={"operationStatus": "ERROR", "operationMessage": "Stock QR epuise", "code": 4010},
            status_code=400,
        )
    )
    client = AssClient(session=session)

    with pytest.raises(AssApiError, match="Stock QR epuise") as exc_info:
        client.stock_qr({"code": "1000"})

    assert exc_info.value.status_code == 400
    assert exc_info.value.response_body["code"] == 4010


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_network_error_raises_ass_api_error():
    session = FakeAssSession(error=requests.ConnectionError("connexion refusee"))
    client = AssClient(session=session)

    with pytest.raises(AssApiError, match="service injoignable"):
        client.calculate_auto_rc({"puissanceFiscale": 8})


@pytest.mark.django_db
@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_successful_real_call_is_journalised():
    from integrations.ass.models import AssApiLog

    client = AssClient(session=FakeAssSession())

    client.stock_qr({"code": "1000"})

    log = AssApiLog.objects.get()
    assert log.endpoint == "/stock.qr"
    assert log.success is True
    assert log.status_code == 200
    assert log.request_payload == {"code": "1000"}
    assert log.response_payload["operationStatus"] == "SUCCESS"
    assert log.duration_ms is not None


@pytest.mark.django_db
@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
)
def test_failed_real_call_is_journalised_with_ass_error():
    from integrations.ass.models import AssApiLog

    session = FakeAssSession(
        response=FakeAssResponse(
            payload={"operationStatus": "ERROR", "operationMessage": "Stock QR epuise", "code": 4010},
            status_code=400,
        )
    )
    client = AssClient(session=session)

    with pytest.raises(AssApiError):
        client.stock_qr({"code": "1000"})

    log = AssApiLog.objects.get()
    assert log.success is False
    assert log.status_code == 400
    assert log.response_payload["code"] == 4010
    assert "Stock QR epuise" in log.error_message


@override_settings(
    ASS_MOCK_ENABLED=True,
    ASS_REAL_CALLS_ALLOWED=False,
)
@pytest.mark.django_db
def test_mock_calls_are_not_journalised():
    from integrations.ass.models import AssApiLog

    client = AssClient(session=FakeAssSession())

    client.stock_qr({"code": "1000"})

    assert AssApiLog.objects.count() == 0


@override_settings(
    ASS_BASE_URL="https://kiiraytest.lasecu-assurances.sn",
    ASS_API_PARTNER_SEGMENT="partner",
    ASS_USERNAME="ass",
    ASS_PASSWORD="secret-test",
    ASS_MOCK_ENABLED=False,
    ASS_REAL_CALLS_ALLOWED=True,
    ASS_CANCEL_ENDPOINT="/qrcode.cancel",
)
def test_cancel_endpoint_is_configurable():
    session = FakeAssSession()
    client = AssClient(session=session)

    client.cancel_attestation({"referenceTrxPartner": "REF-1", "methode": "ANNULER", "motif": ""})

    assert session.calls[0]["url"].endswith("/api/v1/partner/qrcode.cancel")
