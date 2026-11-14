// Fictional sample data from owl-api/fixtures; no live workspace data.
import type { Process, Employee, TrainingPlan, Zone } from '../lib/types.ts'

export const sampleData: { processes: Process[]; employees: Employee[]; plans: TrainingPlan[]; zones: Zone[]; documents: {id: string; title: string; filename: string; text: string}[] } = {
  "processes": [
    {
      "id": "proc-pick-pack",
      "title": "Pick and pack an order",
      "summary": "Take a box, pick the items on the order, check them, pack and seal.",
      "company": "Kide Logistics",
      "language": "en",
      "status": "published",
      "source": "record",
      "expert": "Laura",
      "steps": [
        {
          "id": "step-1",
          "index": 1,
          "title": "Take a medium box",
          "instruction": "Take a medium box (M) and put the order sheet on top of it.",
          "say": "Take a medium box and put the order sheet on top.",
          "reference_image_url": "/studio/preview/media/proc-pick-pack/step-1.jpg",
          "clip_url": "/studio/preview/media/proc-pick-pack/step-1.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "An open cardboard box is on the table",
              "The order sheet is visible"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Laura's recording",
            "quote": "Medium box for up to five items, the big ones only for bulky stuff."
          },
          "reviewed": true
        },
        {
          "id": "step-2",
          "index": 2,
          "title": "Pick the items",
          "instruction": "Pick every item on the order from the shelf into the box.",
          "say": "Pick the three items on the order into the box.",
          "reference_image_url": "/studio/preview/media/proc-pick-pack/step-2.jpg",
          "clip_url": "/studio/preview/media/proc-pick-pack/step-2.mp4",
          "check": {
            "kind": "order",
            "criteria": [
              "Every order line is in the box",
              "No extra items"
            ],
            "order_lines": [
              {
                "sku": "OAT-1L",
                "name": "Oat drink 1 l",
                "qty": 2
              },
              {
                "sku": "COF-500",
                "name": "Coffee 500 g",
                "qty": 1
              },
              {
                "sku": "RYE-CRISP",
                "name": "Rye crispbread",
                "qty": 1
              }
            ]
          },
          "source": {
            "doc": "Laura's recording",
            "quote": "Always check the litre size, the 0.5 l and 1 l cartons look the same."
          },
          "checkpoint": {
            "zone_id": "zone-c",
            "label": "Aisle C · Shelf 12"
          },
          "reviewed": true
        },
        {
          "id": "step-3",
          "index": 3,
          "title": "Check the order",
          "instruction": "Hold the open box in view. Owl checks the items against the order.",
          "say": "Hold the open box in front of you. I'll check it.",
          "reference_image_url": "/studio/preview/media/proc-pick-pack/step-3.jpg",
          "clip_url": null,
          "check": {
            "kind": "order",
            "criteria": [
              "Every order line is in the box",
              "No extra items"
            ],
            "order_lines": [
              {
                "sku": "OAT-1L",
                "name": "Oat drink 1 l",
                "qty": 2
              },
              {
                "sku": "COF-500",
                "name": "Coffee 500 g",
                "qty": 1
              },
              {
                "sku": "RYE-CRISP",
                "name": "Rye crispbread",
                "qty": 1
              }
            ]
          },
          "source": {
            "doc": "Warehouse handbook",
            "quote": "Check every order against the order sheet before you pack it."
          },
          "reviewed": true
        },
        {
          "id": "step-4",
          "index": 4,
          "title": "Pack heavy items first",
          "instruction": "Heavy items at the bottom, light on top. Fill gaps with paper.",
          "say": "Heavy items at the bottom, light ones on top. Fill the gaps with paper.",
          "reference_image_url": "/studio/preview/media/proc-pick-pack/step-4.jpg",
          "clip_url": "/studio/preview/media/proc-pick-pack/step-4.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "Cartons lie at the bottom of the box",
              "Crispbread is on top",
              "Gaps are filled with paper"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Warehouse handbook",
            "quote": "Pack heavy items at the bottom and fill empty space with paper so nothing moves."
          },
          "checkpoint": {
            "zone_id": "zone-pack",
            "label": "Packing station"
          },
          "reviewed": true
        },
        {
          "id": "step-5",
          "index": 5,
          "title": "Seal and label",
          "instruction": "Tape the box shut and put the shipping label on top.",
          "say": "Tape the box shut and put the label on top. Then pinch Done.",
          "reference_image_url": "/studio/preview/media/proc-pick-pack/step-5.jpg",
          "clip_url": "/studio/preview/media/proc-pick-pack/step-5.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "The box is taped shut",
              "The shipping label is on the top side"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Warehouse handbook",
            "quote": "The label always goes on the top side, never over the tape."
          },
          "reviewed": true
        }
      ]
    },
    {
      "id": "proc-bakery-rye",
      "title": "Bake the morning rye bread",
      "summary": "Get ready, weigh, mix on the slow speed, shape eight loaves and bake them in oven 2.",
      "company": "Leipomo Ruis",
      "language": "en",
      "status": "draft",
      "source": "record",
      "expert": "Helena",
      "steps": [
        {
          "id": "step-1",
          "index": 1,
          "title": "Wash hands, put on hairnet",
          "instruction": "Wash your hands for 30 seconds, then put on the hairnet, a clean apron and gloves.",
          "say": "Wash your hands, then put on the hairnet, apron and gloves.",
          "reference_image_url": "/studio/preview/media/proc-bakery-rye/step-1.jpg",
          "clip_url": null,
          "check": {
            "kind": "visual",
            "criteria": [
              "The hairnet covers all hair",
              "Gloves are on both hands"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Helena's recording",
            "quote": "Hairnet and gloves before you touch any dough, every single time."
          },
          "reviewed": false
        },
        {
          "id": "step-2",
          "index": 2,
          "title": "Weigh flour and sourdough",
          "instruction": "Weigh 2.0 kg rye flour and 1.2 kg sourdough into the mixer bowl. Press TARE first.",
          "say": "Weigh two kilos of rye flour and one point two kilos of sourdough. Press tare first.",
          "reference_image_url": "/studio/preview/media/proc-bakery-rye/step-2.jpg",
          "clip_url": "/studio/preview/media/proc-bakery-rye/step-2.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "The scale shows 2.0 kg of rye flour",
              "The sourdough bucket is labelled with today's date"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Helena's recording",
            "quote": "Tare with the empty bowl, or the whole batch is wrong."
          },
          "reviewed": false
        },
        {
          "id": "step-3",
          "index": 3,
          "title": "Mix on slow speed",
          "instruction": "Close the safety guard and turn the mixer lever to 1 (slow). Mix for 8 minutes.",
          "say": "Close the guard and turn the lever to one, slow. Never two for rye.",
          "reference_image_url": "/studio/preview/media/proc-bakery-rye/step-3.jpg",
          "clip_url": "/studio/preview/media/proc-bakery-rye/step-3.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "The mixer lever is in position 1",
              "The safety guard is closed"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Helena's recording",
            "quote": "Rye on speed two overheats and goes sticky. Always one."
          },
          "reviewed": true
        },
        {
          "id": "step-4",
          "index": 4,
          "title": "Shape eight loaves",
          "instruction": "Cut eight 600 g pieces, shape round loaves and set them seam side down on the tray.",
          "say": "Shape eight round loaves and put them seam side down, two rows of four.",
          "reference_image_url": "/studio/preview/media/proc-bakery-rye/step-4.jpg",
          "clip_url": "/studio/preview/media/proc-bakery-rye/step-4.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "Eight loaves are on the tray",
              "The loaves are seam side down"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Helena's recording",
            "quote": "Seam side down, or they split in the oven."
          },
          "reviewed": true
        },
        {
          "id": "step-5",
          "index": 5,
          "title": "Bake in oven 2",
          "instruction": "Put the tray in oven 2 at 230 °C, press steam once and set the timer for 50 minutes.",
          "say": "Oven two, two hundred thirty degrees. Press steam once and set the timer for fifty minutes.",
          "reference_image_url": "/studio/preview/media/proc-bakery-rye/step-5.jpg",
          "clip_url": "/studio/preview/media/proc-bakery-rye/step-5.mp4",
          "check": {
            "kind": "visual",
            "criteria": [
              "Oven 2 shows 230 °C",
              "The timer is set"
            ],
            "order_lines": null
          },
          "source": {
            "doc": "Helena's recording",
            "quote": "Oven two is only for rye. And set the timer, always."
          },
          "reviewed": true
        }
      ]
    }
  ],
  "employees": [
    {
      "id": "emp-sami",
      "name": "Sami",
      "language": "en",
      "role": "Warehouse picker",
      "company": "Kide Logistics",
      "welcome": "Welcome to Kide, Sami! Today you learn to pick and pack an order. I'm Owl. I'll show you each step.",
      "process_ids": [
        "proc-pick-pack"
      ],
      "glasses_id": "glasses-1"
    },
    {
      "id": "emp-amina",
      "name": "Amina",
      "language": "en",
      "role": "Warehouse picker",
      "company": "Kide Logistics",
      "welcome": "Welcome, Amina! You work at Kide now. Today you pick and pack an order. I am Owl. I show you each step.",
      "process_ids": [
        "proc-pick-pack"
      ],
      "glasses_id": "glasses-3"
    },
    {
      "id": "emp-leo",
      "name": "Leo",
      "language": "en",
      "role": "Warehouse picker",
      "company": "Kide Logistics",
      "welcome": "Welcome to Kide Logistics, Leo! Today's task: Pick and pack an order. Every word I say is also on your display.",
      "process_ids": [
        "proc-pick-pack"
      ],
      "glasses_id": "glasses-4"
    },
    {
      "id": "emp-noa",
      "name": "Noa",
      "language": "en",
      "role": "Café counter",
      "company": "Café Kide",
      "welcome": "Welcome to Café Kide, Noa! I'm Owl. At the counter I can listen and suggest answers when you need one.",
      "process_ids": [],
      "glasses_id": "glasses-6"
    },
    {
      "id": "emp-mika",
      "name": "Mika",
      "language": "en",
      "role": "Shift manager",
      "company": "Kide Logistics",
      "welcome": "Hi Mika! When a new worker calls for help, you see their view here and can talk them through it.",
      "process_ids": [],
      "glasses_id": "glasses-7",
      "shift_manager": true
    }
  ],
  "plans": [
    {
      "id": "plan-warehouse-picker",
      "role": "Warehouse picker",
      "days": 5,
      "target": [
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-1",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-2",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-3",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-4",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-5",
          "required": 3
        }
      ]
    },
    {
      "id": "plan-varastotyontekija",
      "role": "Varastotyöntekijä",
      "days": 5,
      "target": [
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-2",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-3",
          "required": 3
        },
        {
          "process_id": "proc-pick-pack",
          "step_id": "step-4",
          "required": 3
        }
      ]
    },
    {
      "id": "plan-cafe-counter",
      "role": "Café counter",
      "days": 5,
      "customer_service": true,
      "target": []
    },
    {
      "id": "plan-leipuriharjoittelija",
      "role": "Leipuriharjoittelija",
      "days": 10,
      "target": [
        {
          "process_id": "proc-bakery-rye",
          "step_id": "step-1",
          "required": 3
        },
        {
          "process_id": "proc-bakery-rye",
          "step_id": "step-2",
          "required": 3
        },
        {
          "process_id": "proc-bakery-rye",
          "step_id": "step-4",
          "required": 3
        }
      ]
    }
  ],
  "zones": [
    {
      "id": "zone-a",
      "name": "Aisle A",
      "kind": "aisle",
      "x": 0.05,
      "y": 0.08,
      "w": 0.14,
      "h": 0.6
    },
    {
      "id": "zone-b",
      "name": "Aisle B",
      "kind": "aisle",
      "x": 0.25,
      "y": 0.08,
      "w": 0.14,
      "h": 0.6
    },
    {
      "id": "zone-c",
      "name": "Aisle C",
      "kind": "aisle",
      "x": 0.45,
      "y": 0.08,
      "w": 0.14,
      "h": 0.6
    },
    {
      "id": "zone-pack",
      "name": "Packing",
      "kind": "packing",
      "x": 0.68,
      "y": 0.08,
      "w": 0.27,
      "h": 0.36
    },
    {
      "id": "zone-load",
      "name": "Loading",
      "kind": "loading",
      "x": 0.68,
      "y": 0.55,
      "w": 0.27,
      "h": 0.37
    }
  ],
  "documents": [
    {
      "id": "warehouse-handbook",
      "title": "Warehouse handbook",
      "filename": "warehouse-handbook.md",
      "text": "# Kide Logistics: warehouse handbook\n\nExample company handbook for the Owl demo. Owl's Ask answers only from documents like this one.\n\n## Your shift\n\n- The shift starts at 7:00. Sign in at the office terminal and pick up your scanner.\n- Safety shoes and the reflective vest are always on in the warehouse.\n- Breaks: 10 minutes at 9:00, lunch 30 minutes at 11:30, 10 minutes at 14:00.\n- Your shift lead is Laura. If you cannot find her, call the office: extension 100.\n\n## Picking an order\n\n- Take one order sheet at a time from the \"Next\" tray.\n- Use a medium box (M) for up to five items. Use a large box (L) only for bulky items.\n- Pick the items in shelf order: aisle A first, then B, then C.\n- Always check the size and amount on the label. The 0.5 l and 1 l oat drink cartons look almost the same.\n- Check every order against the order sheet before you pack it.\n\n## Out of stock\n\nIf an item is out of stock, mark the line as missing on the order and tell the shift lead. Never swap in another product without asking the shift lead.\n\n## Damaged items\n\nA dented can or a leaking carton never goes to a customer. Put it in the red \"Damaged\" box at the end of aisle C and pick a new one.\n\n## Packing\n\n- Pack heavy items at the bottom and fill empty space with paper so nothing moves.\n- Glass and eggs go in a bubble wrap bag first.\n- Tape the box shut with two strips of tape.\n- The label always goes on the top side, never over the tape.\n- Put finished boxes on the outgoing pallet by the door. The truck leaves at 15:00.\n\n## Cold products\n\nChilled items (dairy, oat drink from the cold room) are picked last and packed within 15 minutes. Use a cold bag for them if the order has more than two chilled items.\n\n## Safety\n\n- Never climb the shelves. Use the step ladder for the top shelf.\n- Lift with your legs, not your back. Ask for help with anything over 20 kg.\n- If you see a spill, put the yellow sign next to it and tell the shift lead.\n- In a fire alarm, leave everything and go to the meeting point in the car park.\n"
    },
    {
      "id": "bakery-handbook",
      "title": "Bakery handbook",
      "filename": "bakery-handbook.md",
      "text": "# Leipomo Ruis: bakery handbook\n\nExample company handbook for the Owl demo (JUN-74). Owl's Ask answers only from documents like this one.\n\n## Your shift\n\n- The morning shift starts at 4:30. The first rye bread must be out of the oven by 7:00, when the shop opens.\n- Wash your hands and put on a hairnet, a clean apron and gloves before you touch any dough.\n- Your shift lead is Helena. If you cannot find her, call the shop: extension 20.\n\n## Hygiene\n\n- Wash your hands for 30 seconds: when you arrive, after every break, after the toilet and after touching raw eggs or the bins.\n- Jewellery and watches stay in your locker.\n- A plaster on your hand must be blue, and you wear a glove over it.\n- If you have a stomach illness, do not come to work. Call Helena.\n\n## Allergens\n\n- Our rye bread contains rye (gluten). It contains no milk, eggs or nuts.\n- Seeded loaves contain sesame. Sesame is never used on the rye line before 7:00.\n- Clean the work table and the scale between rye bread and anything with sesame or nuts.\n- If a customer asks about allergens, show the allergen list by the till. Never guess.\n\n## The dough mixer\n\n- The mixer has a lever with three positions: 0 = stop, 1 = slow, 2 = fast.\n- Rye dough is always mixed on 1 (slow) for 8 minutes. Rye dough on 2 overheats and goes sticky.\n- The safety guard must be closed before the lever leaves 0. If the guard opens, the mixer stops; put the lever back to 0 before you close it.\n- Never put a hand or a scraper in the bowl while the lever is on 1 or 2.\n\n## Weighing\n\n- Weigh flour on the big floor scale. Press TARE with the empty bowl on the scale first.\n- The morning rye batch: 2.0 kg rye flour, 1.2 kg sourdough, 1.4 l water at 35 °C and 40 g salt.\n- The sourdough bucket must have today's date on its label. Old sourdough goes back to Helena.\n\n## Shaping\n\n- Cut the dough into eight pieces of 600 g. Check the weight of every second piece.\n- Shape round loaves and put them seam side down on the tray, four in a row, two rows.\n- Let the loaves rise under a cloth for 45 minutes.\n\n## The ovens\n\n- Oven 1 is for buns and pastries. Oven 2 is for rye bread only.\n- Rye bread bakes in oven 2 at 230 °C for 50 minutes. Press the steam button once when the trays go in.\n- Always use the long oven gloves. The oven door and the trays are over 200 °C.\n- Set the timer every time. Never trust your memory with the ovens.\n- The bread is done when it sounds hollow when you knock on the bottom.\n\n## Cooling and the shop\n\n- Cool the loaves on the rack for at least 60 minutes before they are sliced or bagged.\n- Label every bag with the baking date.\n- Bread that is two days old goes to the \"Yesterday's bread\" shelf at half price.\n\n## Safety\n\n- A burn: cool it under cold running water for 20 minutes, then tell Helena. The first aid kit is next to the sink.\n- Spilled flour makes the floor slippery. Sweep it at once.\n- The fire blanket is by oven 2. In a fire, press the red emergency stop by the door.\n"
    },
    {
      "id": "cafe-handbook",
      "title": "Café handbook",
      "filename": "cafe-handbook.md",
      "text": "# Café Kide: counter handbook\n\nExample knowledge base for the Owl demo. In customer service mode, Owl suggests answers only from documents like this one.\n\n## Opening hours\n\n- Monday to Friday 7:30–18:00.\n- Saturday 9:00–16:00.\n- Sunday closed.\n- On public holidays we open at 10:00 and close at 15:00.\n\n## Prices\n\n- Filter coffee 3.20 €, refill 1 € with the same cup.\n- Cappuccino and latte 4.50 €. Oat milk or soy milk costs nothing extra.\n- Cinnamon bun 3.80 €. Rye sandwich 7.90 €.\n- Takeaway cup: bring your own cup and get 0.30 € off.\n\n## Returns and refunds\n\n- A drink that is wrong or cold is remade at once, free of charge. No receipt needed.\n- Unopened coffee beans can be returned within 14 days with the receipt.\n- Refunds go back to the card that paid. Cash is refunded in cash.\n- Opened coffee beans cannot be returned. Offer a different roast instead.\n\n## Allergens\n\n- The allergen list for every product is in the blue folder next to the till.\n- The cinnamon buns contain gluten, milk and egg. The rye sandwich contains gluten.\n- We have gluten-free oat cookies, but they are made in a kitchen that also handles wheat.\n- If you are not sure, never guess: show the customer the allergen folder or ask the shift lead.\n\n## Loyalty card\n\n- Every coffee gets one stamp. The tenth coffee is free.\n- A lost card cannot be replaced, but you can start a new one.\n\n## Payment\n\n- We take cards, phone payments and cash. The smallest card payment is 1 €.\n- Lunch vouchers (Edenred, ePassi) are accepted for food, not for packaged products.\n\n## Wi-Fi and seats\n\n- The Wi-Fi network is KideGuest. The password is on the receipt.\n- Seats by the window are free for everyone; the big table can be booked for groups of six or more.\n"
    }
  ]
}
