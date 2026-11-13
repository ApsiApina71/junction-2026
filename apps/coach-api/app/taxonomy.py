"""Labels and the three-basket classification. Pure data and pure functions."""

from typing import Literal

Basket = Literal["regular", "irregular", "everyday"]
BASKETS: tuple[Basket, ...] = ("regular", "irregular", "everyday")

BASKET_LABELS = {
    "regular": {"en": "Regular essentials", "fi": "Säännölliset pakolliset"},
    "irregular": {"en": "Unexpected necessities", "fi": "Yllättävät pakolliset"},
    "everyday": {"en": "Everyday spending", "fi": "Arjen kulutus"},
}

# Spending categories as they appear in the data (everything else is income, saving or a transfer).
SPEND_CATEGORIES = (
    "Housing",
    "Utilities",
    "Groceries",
    "Transportation",
    "Health",
    "Home & Tech",
    "Restaurants",
    "Entertainment",
    "Lifestyle",
    "Travel",
)
CATEGORY_FI = {
    "Housing": "Asuminen",
    "Utilities": "Laskut ja sopimukset",
    "Groceries": "Ruokakauppa",
    "Transportation": "Liikkuminen",
    "Health": "Terveys",
    "Home & Tech": "Koti ja tekniikka",
    "Restaurants": "Ravintolat ja kahvilat",
    "Entertainment": "Viihde",
    "Lifestyle": "Vapaa-aika ja ostokset",
    "Travel": "Matkailu",
    "Salary": "Palkka",
    "Other Income": "Muut tulot",
    "Invest Deposit": "Sijoitukset",
    "Invest Withdraw": "Sijoitusten nostot",
    "Salary Sweep": "Siirto toiseen pankkiin",
}

# Merchant category code -> (key, English, Finnish). The key doubles as the subcategory id.
MCC: dict[str, tuple[str, str, str]] = {
    "5411": ("supermarkets", "Supermarkets", "Ruokakaupat"),
    "5499": ("convenience_food", "Convenience and specialty food", "Kioskit ja erikoisruokakaupat"),
    "5422": ("meat_frozen", "Meat and frozen food shops", "Liha- ja pakastemyymälät"),
    "5451": ("dairy", "Dairy shops", "Maitotuotekaupat"),
    "5812": ("restaurants", "Restaurants", "Ravintolat"),
    "5814": ("fast_food_cafes", "Fast food and cafes", "Pikaruoka ja kahvilat"),
    "5813": ("bars", "Bars and nightlife", "Baarit ja yöelämä"),
    "5541": ("fuel", "Service stations", "Huoltoasemat"),
    "5542": ("fuel_auto", "Fuel dispensers", "Polttoaineautomaatit"),
    "7523": ("parking", "Parking", "Pysäköinti"),
    "4111": ("public_transport", "Public transport", "Joukkoliikenne"),
    "4121": ("taxis", "Taxis and ride hailing", "Taksit"),
    "7922": ("tickets", "Theatre and event tickets", "Teatteri- ja tapahtumaliput"),
    "7999": ("recreation", "Recreation services", "Vapaa-ajan palvelut"),
    "7832": ("cinema", "Cinema", "Elokuvat"),
    "7991": ("attractions", "Attractions and exhibits", "Nähtävyydet ja näyttelyt"),
    "7996": ("amusement", "Amusement parks", "Huvipuistot"),
    "5912": ("pharmacy", "Pharmacies", "Apteekit"),
    "8011": ("doctors", "Doctors", "Lääkärit"),
    "8099": ("health_services", "Health services", "Terveyspalvelut"),
    "8021": ("dentists", "Dentists", "Hammaslääkärit"),
    "5200": ("home_supply", "Home supply stores", "Kodintarvikkeet"),
    "5732": ("electronics", "Electronics", "Elektroniikka"),
    "5251": ("hardware", "Hardware stores", "Rautakaupat"),
    "5712": ("furniture", "Furniture", "Huonekalut"),
    "5734": ("software", "Software", "Ohjelmistot"),
    "5941": ("sporting_goods", "Sporting goods", "Urheiluvälineet"),
    "5651": ("clothing", "Clothing", "Vaatteet"),
    "5691": ("clothing_other", "Clothing (other)", "Vaatteet (muut)"),
    "5999": ("misc_retail", "Miscellaneous retail", "Sekalaiset ostokset"),
    "5942": ("books", "Book shops", "Kirjakaupat"),
    "5945": ("hobby_toys", "Hobby, toy and game shops", "Harrastus- ja lelukaupat"),
    "4722": ("travel_agencies", "Travel agencies", "Matkatoimistot"),
    "4511": ("airlines", "Airlines", "Lennot"),
    "7011": ("hotels", "Hotels", "Hotellit"),
    "7512": ("car_rental", "Car rental", "Autonvuokraus"),
}

# Transfers and other non-card rows get a subcategory from their category.
CATEGORY_SUB = {
    "Housing": ("housing", "Rent or housing loan", "Vuokra tai asuntolaina"),
    "Utilities": ("utilities", "Bills and contracts", "Laskut ja sopimukset"),
    "Groceries": ("groceries_other", "Groceries (other)", "Ruokaostokset (muut)"),
    "Transportation": ("transport_other", "Transport (other)", "Liikkuminen (muut)"),
    "Health": ("health_other", "Health (other)", "Terveys (muut)"),
    "Home & Tech": ("home_tech_other", "Home and tech (other)", "Koti ja tekniikka (muut)"),
    "Restaurants": ("restaurants_other", "Eating out (other)", "Ulkona syöminen (muut)"),
    "Entertainment": ("entertainment_other", "Entertainment (other)", "Viihde (muut)"),
    "Lifestyle": ("lifestyle_other", "Shopping (other)", "Ostokset (muut)"),
    "Travel": ("travel_other", "Travel (other)", "Matkailu (muut)"),
    "Salary": ("salary", "Salary", "Palkka"),
    "Other Income": ("other_income", "Other income", "Muut tulot"),
    "Invest Deposit": ("invest_deposit", "Investment deposit", "Sijoitustalletus"),
    "Invest Withdraw": ("invest_withdraw", "Investment withdrawal", "Sijoitusnosto"),
    "Salary Sweep": ("salary_sweep", "Transfer to another bank", "Siirto toiseen pankkiin"),
}

SUB_LABELS: dict[str, dict[str, str]] = {key: {"en": en, "fi": fi} for key, en, fi in (*MCC.values(), *CATEGORY_SUB.values())}

# A one-off purchase this large in a necessity-like category is treated as an unexpected necessity.
BIG_TICKET_EUR = 150.0
_COMMUTE_SUBS = {"public_transport", "fuel", "fuel_auto"}


def subcategory(category: str, mcc: str | None) -> str:
    if mcc and mcc in MCC:
        return MCC[mcc][0]
    return CATEGORY_SUB.get(category, (category.lower(), category, category))[0]


def kind(category: str) -> str:
    """spend | income | saving | transfer"""
    if category in SPEND_CATEGORIES:
        return "spend"
    if category in ("Salary", "Other Income"):
        return "income"
    if category in ("Invest Deposit", "Invest Withdraw"):
        return "saving"
    return "transfer"


def default_basket(category: str, sub: str, amount: float) -> Basket:
    """The starting classification. Customers can override it per category or subcategory."""
    if category in ("Housing", "Utilities", "Groceries"):
        return "regular"
    if category == "Transportation":
        return "regular" if sub in _COMMUTE_SUBS else "everyday"
    if category == "Health":
        return "irregular"
    if category == "Home & Tech":
        return "irregular" if abs(amount) >= BIG_TICKET_EUR else "everyday"
    return "everyday"


def basket_for(category: str, sub: str, amount: float, overrides: dict[str, str] | None = None) -> Basket:
    if overrides:
        chosen = overrides.get(sub) or overrides.get(category)
        if chosen in BASKETS:
            return chosen  # type: ignore[return-value]
    return default_basket(category, sub, amount)
