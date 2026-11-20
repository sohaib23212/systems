/**
 * EquipmentLinkedList.java
 *
 * A custom singly linked list that stores references to Equipment objects.
 * In Phase Two this class replaces the fixed-size arrays of Phase One:
 * array indexing becomes node traversal, and array shifting becomes link updates.
 *
 * Every method keeps these rules true:
 *  - head is null exactly when the list is empty (size == 0).
 *  - the number of nodes reachable from head always equals size.
 *  - the last node's next is null, so the list always ends and has no cycle.
 *
 * The list only manages nodes and links. It never changes equipment
 * availability; that is the job of the application class.
 */
public class EquipmentLinkedList {

    /**
     * A node represents one position in the list.
     * It holds a reference to an Equipment object and a link to the next node.
     */
    private static class Node {
        private Equipment data;   // the equipment stored at this position
        private Node next;        // the following node, or null at the end of the list

        Node(Equipment data) {
            this.data = data;
            this.next = null;
        }
    }

    private Node head;  // first node of the list, or null when the list is empty
    private int size;   // number of nodes currently in the list

    /**
     * Creates an empty list.
     */
    public EquipmentLinkedList() {
        head = null;
        size = 0;
    }

    /**
     * Appends a new node containing the given equipment at the end of the list.
     * The caller must validate the equipment before calling this method.
     */
    public void addLast(Equipment equipment) {
        Node newNode = new Node(equipment);

        if (head == null) {
            // Empty list: the new node becomes the first node.
            head = newNode;
        } else {
            // Walk to the last node (the one whose next is null),
            // then link the new node after it.
            Node current = head;
            while (current.next != null) {
                current = current.next;
            }
            current.next = newNode;
        }
        size++;
    }

    /**
     * Traverses the list and returns the equipment whose ID matches,
     * or null if no node matches. The list is not changed.
     * IDs are compared after trimming and ignoring letter case.
     */
    public Equipment findById(String equipmentId) {
        if (equipmentId == null) {
            return null;
        }
        String target = equipmentId.trim();

        Node current = head;
        while (current != null) {
            if (idMatches(current, target)) {
                return current.data;
            }
            current = current.next;
        }
        return null;
    }

    /**
     * Unlinks the node whose equipment ID matches, decreases the size once,
     * and returns the equipment it contained.
     * Returns null and leaves the list unchanged if no node matches.
     * IDs are compared after trimming and ignoring letter case.
     */
    public Equipment removeById(String equipmentId) {
        if (equipmentId == null || head == null) {
            return null;  // nothing to remove from an empty list
        }
        String target = equipmentId.trim();

        // Case 1: the first node matches, so head moves to the second node.
        // If it was the only node, head.next is null and the list becomes empty.
        if (idMatches(head, target)) {
            Node removed = head;
            head = head.next;
            removed.next = null;  // detach the removed node from the list
            size--;
            return removed.data;
        }

        // Case 2: a middle or last node matches.
        // Keep a reference to the previous node so we can reconnect
        // the predecessor directly to the successor of the removed node.
        Node previous = head;
        Node current = head.next;
        while (current != null) {
            if (idMatches(current, target)) {
                previous.next = current.next;  // skip the node (becomes null if it was last)
                current.next = null;           // detach the removed node from the list
                size--;
                return current.data;
            }
            previous = current;
            current = current.next;
        }

        // No match: nothing was changed.
        return null;
    }

    /**
     * Reports whether the list contains no nodes.
     */
    public boolean isEmpty() {
        return head == null;
    }

    /**
     * Returns the current number of nodes in the list.
     */
    public int size() {
        return size;
    }

    /**
     * Traverses the list from head to the end and prints each equipment
     * using its toString() method. Prints a message if the list is empty.
     */
    public void display() {
        if (head == null) {
            System.out.println("Message: The list is empty.");
            return;
        }
        Node current = head;
        while (current != null) {
            System.out.println(current.data.toString());
            current = current.next;
        }
    }

    /**
     * Helper: checks whether the node's equipment ID equals the given
     * (already trimmed) ID, ignoring letter case.
     */
    private boolean idMatches(Node node, String trimmedId) {
        return node.data.getId().trim().equalsIgnoreCase(trimmedId);
    }
}
