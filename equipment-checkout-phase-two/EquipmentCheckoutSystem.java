import java.util.Scanner;

/**
 * EquipmentCheckoutSystem.java
 *
 * Menu-driven application for the Simple Equipment Checkout System (Phase Two).
 * Equipment is stored in two separate custom singly linked lists:
 *  - inventory : every registered equipment item, in registration order.
 *  - checkedOut: references to the equipment currently in use, in checkout order.
 *
 * Checking out adds a NEW node to checkedOut that points to the SAME Equipment
 * object that is already in the inventory, so both lists always show the same
 * availability. Returning removes only the checkout node; the equipment stays
 * in the inventory.
 *
 * Input validation, capacity rules and availability changes are kept in this
 * class. The list class only manages nodes and links.
 */
public class EquipmentCheckoutSystem {

    private static final int MAX_INVENTORY = 5;   // application rule: at most 5 registered items
    private static final int MAX_CHECKOUTS = 3;   // application rule: at most 3 active checkouts

    private static final Scanner input = new Scanner(System.in);

    // Two separate list objects, both using the custom EquipmentLinkedList class.
    private static final EquipmentLinkedList inventory = new EquipmentLinkedList();
    private static final EquipmentLinkedList checkedOut = new EquipmentLinkedList();

    public static void main(String[] args) {
        int choice;

        // Show the menu again after every action until the user chooses 6.
        do {
            displayMenu();
            choice = readMenuChoice();
            System.out.println();

            switch (choice) {
                case 1:
                    addEquipment();
                    break;
                case 2:
                    checkOutEquipment();
                    break;
                case 3:
                    returnEquipment();
                    break;
                case 4:
                    viewInventory();
                    break;
                case 5:
                    viewCheckedOutEquipment();
                    break;
                case 6:
                    System.out.println("Goodbye!");
                    break;
                default:
                    System.out.println("Error:");
                    System.out.println("Invalid menu choice. Please select 1 through 6.");
            }
            System.out.println();
        } while (choice != 6);

        input.close();
    }

    /**
     * Prints the six menu options and the choice prompt.
     */
    private static void displayMenu() {
        System.out.println("----- Equipment Checkout System -----");
        System.out.println("1. Add Equipment");
        System.out.println("2. Check Out Equipment");
        System.out.println("3. Return Equipment");
        System.out.println("4. View Equipment Inventory");
        System.out.println("5. View Checked-Out Equipment");
        System.out.println("6. Exit");
        System.out.print("Enter your choice: ");
    }

    /**
     * Reads the menu choice as a whole line and converts it to a number.
     * Non-numeric input (such as "abc") returns -1, which the menu treats
     * as an invalid choice, so the program never crashes.
     */
    private static int readMenuChoice() {
        if (!input.hasNextLine()) {
            return 6;  // input has ended: exit normally instead of crashing
        }
        String line = input.nextLine().trim();
        try {
            return Integer.parseInt(line);
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /**
     * Prints a prompt and returns the user's input with surrounding spaces removed.
     */
    private static String readText(String prompt) {
        System.out.print(prompt);
        if (!input.hasNextLine()) {
            return "";  // input has ended: treated as an empty value
        }
        return input.nextLine().trim();
    }

    /**
     * Option 1: validates the ID, name, inventory capacity and ID uniqueness,
     * then creates the equipment and appends its node to the inventory.
     */
    private static void addEquipment() {
        // Capacity check uses the list's own size() instead of a separate counter.
        if (inventory.size() >= MAX_INVENTORY) {
            System.out.println("Error: Inventory is full. Maximum of "
                    + MAX_INVENTORY + " equipment items reached.");
            return;
        }

        String id = readText("Equipment ID   : ");
        if (id.isEmpty()) {
            System.out.println("Error: Equipment ID cannot be empty.");
            return;
        }

        String name = readText("Equipment Name : ");
        if (name.isEmpty()) {
            System.out.println("Error: Equipment name cannot be empty.");
            return;
        }

        // findById compares trimmed IDs ignoring case, so "e101" equals "E101".
        if (inventory.findById(id) != null) {
            System.out.println("Error: An item with this equipment ID already exists.");
            return;
        }

        inventory.addLast(new Equipment(id, name));
        System.out.println("Equipment added successfully.");
    }

    /**
     * Option 2: finds the equipment in the inventory, checks that it is
     * available and that the checkout limit is not reached, then appends a
     * new checkout node that references the same equipment object.
     */
    private static void checkOutEquipment() {
        String id = readText("Equipment ID: ");
        if (id.isEmpty()) {
            System.out.println("Error: Equipment ID cannot be empty.");
            return;
        }

        Equipment equipment = inventory.findById(id);
        if (equipment == null) {
            System.out.println("Error: No equipment with this ID exists in the inventory.");
            return;
        }
        if (!equipment.isAvailable()) {
            System.out.println("Error: This equipment is already checked out.");
            return;
        }
        if (checkedOut.size() >= MAX_CHECKOUTS) {
            System.out.println("Error: Maximum of " + MAX_CHECKOUTS + " active checkouts reached.");
            return;
        }

        // A new node is created inside addLast, but it stores the SAME object
        // reference: the equipment is not copied.
        checkedOut.addLast(equipment);
        equipment.setAvailable(false);
        System.out.println("Equipment checked out successfully.");
    }

    /**
     * Option 3: removes the equipment's node from the checkout list by
     * updating links, then marks the same equipment object as available.
     * The inventory list is not changed.
     */
    private static void returnEquipment() {
        String id = readText("Equipment ID: ");
        if (id.isEmpty()) {
            System.out.println("Error: Equipment ID cannot be empty.");
            return;
        }

        Equipment returned = checkedOut.removeById(id);
        if (returned == null) {
            // removeById changed nothing; explain why the return was rejected.
            if (inventory.findById(id) == null) {
                System.out.println("Error: No equipment with this ID exists in the inventory.");
            } else {
                System.out.println("Error: This equipment is not currently checked out.");
            }
            return;
        }

        returned.setAvailable(true);
        System.out.println("Equipment returned successfully.");
    }

    /**
     * Option 4: shows every registered item in registration order.
     */
    private static void viewInventory() {
        if (inventory.isEmpty()) {
            System.out.println("Message: The equipment inventory is empty.");
            return;
        }
        System.out.println("----- Equipment Inventory -----");
        inventory.display();
    }

    /**
     * Option 5: shows the checked-out items in checkout order.
     */
    private static void viewCheckedOutEquipment() {
        if (checkedOut.isEmpty()) {
            System.out.println("Message: No equipment is currently checked out.");
            return;
        }
        System.out.println("----- Checked-Out Equipment -----");
        checkedOut.display();
    }
}
